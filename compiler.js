'use strict';

const fs = require('fs-extra');
const _ = require('lodash');
const execa = require('execa');
const glob = require('globby');
const jsonMinify = require('json-minify');
const _path = require('nodeshy-path');
const fetchDependencies = require('./fetch-dependencies');

function fetchDeps(options, pj) {
  if (!options.deps) {
    return pj.dependencies;
  }
  let a = options.deps.split(';').map(e => e.split(':'));
  if (pj.dependencies) {
    a = a.concat(Object.entries(pj.dependencies));
  }
  a = _.uniqBy(a, e => a[0]);
  // back to obj
  return a.reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
}

function and(a, b, def) {
  return a ? a[b] : def;
}
function validPropOr(a, b, def) {
  if (a && a[b]) return a[b];
  return def;
}

module.exports = program => {
  program
    .command('build [project]')
    .description('compile a jazz project')
    .option('-e, --jsc', 'explicit path to jsc compiler')
    .option('-d, --debug', 'force compile in debug mode')
    .option('-o, --out [name]', 'change output file name')
    .option('-v, --version [version]', 'purely cosmetic')
    .option('-c, --compat [fw]', 'set framework for receiving dependencies')
    .option('-t, --target [target]', 'can be exe, winexe or library')
    .option('-p, --platform [platform]', 'platform for project output. can be x86, Itanium, x64, or "any"')
    .option('-a, --autoref', 'force enable autoref: automatically reference assemblies based on imported namespaces and qualified names')
    .option('-n, --no-autoref', 'force disable autoref')
    .option('-f, --fast', 'disable language features to allow better code generation')
    .option('-s, --slow', 'force disable fastmode')
    .option('-z, --warn-as-error', 'treat warnings as errors')
    .option('-w, --warn [level]', 'warning level (0-4)')
    .option('-i, --deps [deps]', 'force include dependencies to download (Name:Version;...)')
    .option('-r, --refs [refs]', 'force include project references (Ref;...)')
    .option('-c, --no-fetch', 'force disable fetching dependencies')
    .option('-#, --defs [defines]', 'force include conditional compilation #defines')
    .action(compile);
}

async function compile(project, options) {
/*
jsc [options] <source files> [[options] <source files>...]
  /out:<file>              Specify name of binary output file
  /t[arget]:exe            Create a console application (default)
  /t[arget]:winexe         Create a windows application
  /t[arget]:library        Create a library assembly
  /platform:<platform>     Limit which platforms this code can run on; must be x86, Itanium, x64, or any cpu, which is the default
  /autoref[+|-]            Automatically reference assemblies based on imported namespaces and fully-qualified names (on by default)
  /lib:<path>              Specify additional directories to search in for references
  /r[eference]:<file list> Reference metadata from the specified assembly file
                           <file list>: <assembly name>[;<assembly name>...]
  /win32res:<file>         Specifies Win32 resource file (.res)
  /res[ource]:<info>       Embeds the specified resource
                           <info>: <filename>[,<name>[,public|private]]
  /linkres[ource]:<info>   Links the specified resource to this assembly
                           <info>: <filename>[,<name>[,public|private]]
  /debug[+|-]              Emit debugging information
  /fast[+|-]               Disable language features to allow better code generation
  /warnaserror[+|-]        Treat warnings as errors
  /w[arn]:<level>          Set warning level (0-4)
  @<filename>              Read response file for more options
  /?                       Display help
  /help                    Display help
  /d[efine]:<symbols>      Define conditional compilation symbol(s)
  /nologo                  Do not display compiler copyright banner
  /print[+|-]              Provide print() function

                           - ADVANCED -
  /codepage:<id>           Use the specified code page ID to open source files
  /lcid:<id>               Use the specified lcid for messages and default code page
  /nostdlib[+|-]           Do not import standard library (mscorlib.dll) and change autoref default to off
  /utf8output[+|-]         Emit compiler output in UTF-8 character encoding
  /versionsafe[+|-]        Specify default for members not marked 'override' or 'hide'
*/
  function opt(a, b, def) {
    if (options[a]) return options[a];
    if (pj[b] && pj[b][a]) return pj[b][a];
    return def;
  }
  function optp(a, b, def) {
    return opt(a, b, def) ? '+' : '-';
  }
  function flagSwitch(name, a, b, def) {
    flags.push(name + optp(a, b, def));
  }
  function weirdFlag(thisOne, butNotThisOne, fromWhere) {
    if (options[thisOne]) return '+';
    if (options[butNotThisOne]) return '-';
    
    return opt(thisOne, fromWhere, false) ? '+' : '-';
  }
  function negativeSwitch(a,b,c,d) {
    return flags.push(a + weirdFlag(b, c, d));
  }
  
  let path = _path({}, false, true);
  if (!path.jsc) {
    console.warn('jsc not found in path');
    return; 
  } else {
    path = path.jsc;
  }
  
  const pj = JSON.parse(jsonMinify(fs.readFileSync(project ? project + '.jazz.json' : 'project.jazz.json', 'utf8')));
  
  // purely cosmetic
  const version = options.v || pj.version;
  // used for retrieving dependencies (def: .NETFramework4.5)
  let compat = opt('compat', 'compilation', '.NETFramework4.5');
  if (compat[0] != '.') compat = '.'+compat;

  const flags = [];
  
  const target = opt('target', 'compilation', 'exe');
  flags.push('/t:' + target);
  
  const otherout = (pj.name || 'defaultproject') + (target == 'library' ? '.dll' : '.exe');
  flags.push('/out:' + (options.out || otherout));
  
  const platf = opt('platform', 'compilation', 'any');
  if (platf != 'any') flags.push('/platform:' + platf);
  
  flagSwitch('/debug', 'debug', 'compilation', false);
  flagSwitch('/autoref', 'autoref', 'compilation', true);
  flagSwitch('/warnaserror', 'warn-as-error', 'compilation', false);
  
  flags.push('/lib:libraries');
  negativeSwitch('/fast', 'fast', 'slow', 'compilation');
  
  const wn = opt('warnings', 'compilation', -1);
  if (wn != -1) flags.push('/w:' + wn);
  
  const pjDefines = validPropOr(pj._extra, 'define', []);
  const optionsDefines = options.defs ? options.defs.split(';') : [];
  const defs = _.uniq([...pjDefines, ...optionsDefines]);
  if (defs.length) flags.push('/d:' + defs.join(';'));
  
  const pjRefs = pj.references || [];
  const optionsRefs = options.refs ? options.refs.split(';') : [];
  const refs = _.uniq([...pjRefs, ...optionsRefs]);
  if (refs.length) flags.push('/r:' + refs.join(';'));
  
  if (pj._extra && pj._extra.print) flags.push('/print+');
  
  const files = await glob('**/*.js');
  const args = [...flags, ...files];
  
  console.log('"' + args.join('" "') + '"');
  
  if (!options.noFetch) {
    await fetchDependencies(compat, fetchDeps(options, pj));
  }
  
  try {
    const pro = execa(path, args)
    pro.stdout.pipe(process.stdout);
    pro.stderr.pipe(process.stderr);
    
    await process;
  } catch (e) {
    console.error(e);
  }
}
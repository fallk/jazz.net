// All JavaScript and no play makes Jack a dull boy 
// All JavaScript and no play mmakes Jack a dull boy 
// All JavaScript and no play makes Jack a dull boy 
// All JavaScript and n  play makes Jack a dull boy 
// All Javascript and no play makes Jack a dull boy                                  GOD IS DEAD
// All JavaScript and no PLay makes Jack a dull boy                                   GOD IS DEAD
// All JavaScript and no play ma es Jack a dull boy                                    GOD IS DEAD
// All JavaScript and no play makes Jack a dull boy                                     GOD IS DEAD
// All JavaScript and no play makes Jack a dull boy                                       GOD IS DEAD
// All JavaSsript and no play makes Jack a dyll boy                                       GOD IS DEAD
//                                                                                          GOD IS DEAD
//                                                                                           GOD IS DEAD
//                                                                                            GOD IS DEAD
//  death has one move left, i have none                        I should know I killed him
//  Death has one move left, i have none              I should know I killed him
//  death has one move left, I have none                           I should know I killed him
//  Death has one move left, i have none                          I should know I killed him
//  death has one move left, i have none                    I should know I killed him
//  death has one move left,Ii have none                 I should know I killed him
//  Death has one move left, i have none               I should know I killed him
//                                                 I should know I killed him
//                                               I should know I killed him
//                                       I should know I killed him
//  
//                  Here in the forgest dark and deep
//                 I offer you eternal sleep
//  
//                                          Here in the fores0t dark and deep
//                                              I offer you eternal sleep
//  
//  
//                   Here in the forest dark and deep
//                     I offer you eternal sleep
//  
//  
//  
//  


//function objectFrom(arr) {
//  return Object.assign(...arr.map( ([k, v]) => ({[k]: v}) ));
//}
//function objectFilter(obj, predicate) {
//  return objectFrom(Object.entries(obj).filter(e => predicate(e[0], e[1])));
//}

function objectFilter(obj, predicate) {
  const result = {};
  
  for (let key in obj) {
    if (obj.hasOwnProperty(key) && predicate(key, obj[key])) {
      result[key] = obj[key];
    }
  }

  return result;
};
function filterMutating(obj, predicate) {
  for (let key in obj) {
    if (obj.hasOwnProperty(key) && !predicate(key, obj[key])) {
      delete obj[key];
    }
  }
  return obj;
};

function cl(str) {
  return (typeof str == 'string' ? str : require('util').inspect(str)).replace(/[\r\n]/g, '').substring(0, 80);
}

function pstream(stream, ev) {
  return new Promise((resolve, reject) => {
    stream.on(ev, (...args) => {
      resolve(...args);
    });
  });
}

const https = require('https');
// note: need to find a better library this one is too slow
const unzipper = require('unzipper');
const fs = require('fs-extra');
const { WritableStream } = require('memory-streams');
const request = require('request-promise-any').defaults({ encoding: null });
const streamBuffers = require('stream-buffers');
const xml2js = require('xml2js-es6-promise');
const naturalSort = require('naturalsort');

//function pipeToStream(v) {
//  stream.on('readable', buffer => {
//    var part = buffer.read().toString('utf8');
//    v.v += part;
//    console.log('stream data ' + part);
//  });
//
//  stream.on('end',function(){
//   console.log('final output ' + string);
//  });
//}

async function dl(pkgName, version) {
  const fname = '.jazznet/nuget-' + pkgName + '-' + version + '.nupkg';
  if (fs.existsSync(fname)) {
    return await fs.readFileSync(fname);
  }
  
  const buf = await request.get('https://www.nuget.org/api/v2/package/' + pkgName + '/' + version);
  console.log(buf);
  
  await fs.writeFile(fname, buf);
  
  return buf;
}

async function extract(buf, regex, writer) {
  
  const stream = new streamBuffers.ReadableStreamBuffer();
  stream.put(buf);
  stream.stop();
  
  let didItDone = false;
  
  // memory stream is sync, no need to await it specifically
  const s2 = stream
    .pipe(unzipper.Parse())
    .on('entry', entry => {
      const {path, type} = entry;
      if (!didItDone && regex.exec(path)) {
        console.log('Y', path);
        didItDone = true;
        entry.pipe(writer);
        console.log('D', path);
      } else {
        console.log('N', path);
        entry.autodrain();
      }
    });
  
  await pstream(s2, 'finish');
  
  if (!didItDone) {
    console.log('NO MATCH FOR ', regex, new Error().stack || new Error().trace);
  }
  
  return writer;
}

async function extractAndParse(buf) {
  console.log('b');
  
  const metaWriter = await extract(buf, /\.nuspec/, new WritableStream());
  
  console.log('f');
  
  const string = metaWriter.toString();
  console.log(cl(string));
  console.log('g');
  
  return await xml2js(string);
}

async function extractDll(buf, pkgName, regex) {
  const stream = fs.createWriteStream('./libraries/' + pkgName + '.dll');
  
  const awaitMe = pstream(stream, 'finish');
  
  const dllWriter = await extract(buf, regex, stream);
  
  await awaitMe;
}

function findBestDepMatch(metaDeps, compat) {
  if (!metaDeps.length) return {
    $: { targetFramework: "N/A" },
    dependency: []
  };
  
  let f = metaDeps.find(e => e.$.targetFramework == compat);
  if (f) return f;
  
  console.warn('No immediate match',compat,'for dep');
  compat = compat.replace(/[0-9].*/, '');
  f = metaDeps.filter(e => e.$.targetFramework.startsWith(compat)).sort((a,b) => - naturalSort(a,b));
  if (f.length) return f[0];
  
  console.error('No match at all for',compat,'going with',metaDeps[0].$.targetFramework,'... might be incompatible');
  return metaDeps[0];
}

module.exports = async (compat, dependencies) => {
  await fs.ensureDir('./libraries');
  dependencies = filterMutating(dependencies, (k,v) => !fs.existsSync('./libraries/' + k + '.dll'));
  
  // repeated iteration as the object is modified
  const iterateds = [];
  let ks = Object.keys(dependencies);
  while (iterateds.length < ks.length) {
    for (let name of ks) {
      if (iterateds.indexOf(name) > -1) continue;
      iterateds.push(name);
      console.log(iterateds);
      
      const version = dependencies[name];
      console.log('Downloading',name,version);
      
      const buf = await dl(name, version);
      console.log('Extracting',name,version);
      const meta = await extractAndParse(buf);
      console.log('Extraction finished');
      
      console.log(cl(meta));
      
      await fs.outputJson('./_debug_meta.json', meta, { spaces: 2 });
      
      const metaDeps = meta.package.metadata[0].dependencies[0].group;
      const bestDeps = findBestDepMatch(metaDeps, compat);
      const fw = bestDeps.$.targetFramework;
      console.log(name, ': framework :', fw, ' (expecting', compat, ')');
      
      // package has no deps. we'll have to guess the DLL to extract
      if (fw == 'N/A') {
        // TODO need better guess system, actually looking at the compat and going through the entries..
        // perhaps we can use extractAndParse to output the entries list and we can avoid extracting more than twice...
        await extractDll(buf, name, /.*\.dll/);
        //fs.existsSync('./libraries/' + k + '.dll')
      } else {
        let e;
        if (fw.startsWith('.NETFramework')) {
          // matches: net20, net45, net46
          e = new RegExp('lib/net' + fw.match(/[0-9]/g).join('') + '/' + name + '\\.dll');
        } else if (fw.startsWith('.NETPortable')) {
          // matches: portable-net
          e = /^lib\/portable-net/;
        } else if (fw.startsWith('.NETStandard')) {
          // matches: netstandard1.0, netstandard1.3, netstandard2.0
          e = new RegExp('lib/' + fw.substring(1).toLowerCase().replace(/\./g, '\\.') + '/' + name + '\\.dll');
        } else {
          // matches: anything!
          e = /.*\.dll/;
        }
        console.log('Extracting dll', name, e);
        await extractDll(buf, name, e);
        console.log('Extraction finished');
      }
      
      // no dependencies. amazing!
      if (!bestDeps.dependency) continue;
      
      // add dependencies to map if not there
      const realDeps = bestDeps.dependency.map(e => e.$);
      console.log(realDeps.map(e => e.id + ':' + e.version).join(';').slice(0, 80));
      for (let d of realDeps) {
        if (d.id in dependencies) {
          if (dependencies[d.id] !== d.version) {
            console.log('VERSION MISMATCH:', d.id, 'using', dependencies[d.id], 'but found', d.version);
          }
        } else {
          dependencies[d.id] = d.version;
        }
      }
    }
    ks = Object.keys(dependencies);
  }
};
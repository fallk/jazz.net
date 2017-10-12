function pstream(stream, ev) {
  return new Promise((resolve, reject) => {
    stream.on(ev, (...args) => {
      resolve(...args);
    });
  });
}

const https = require('https');
const unzip = require('unzip');
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
  const req = await request.get('https://www.nuget.org/api/v2/package/' + pkgName + '/' + version);
  console.log(req);
  
  return req;
}

async function extract(buf, parser) {
  
  const stream = new streamBuffers.ReadableStreamBuffer();
  stream.put(buf);
  stream.stop();
  
  const s2 = 
  stream
    .pipe(unzip.Parse())
    .on('entry', entry => {
      console.log('d');
      var fileName = entry.path;
      var type = entry.type; // 'Directory' or 'File' 
      var size = entry.size;
      
      if (parser.condition(fileName, type, size)) {
        entry.pipe(parser.writer);
      } else {
        entry.autodrain();
      }
      console.log('e');
    });
  console.log('c');
  
  // memory stream is sync, no need to await it specifically
  await pstream(s2, 'close');
  
}

async function extractAndParse(buf) {
  
  console.log('a');
  const metaWriter = new WritableStream();
  console.log('b');
  
  await extract(buf, {
    writer: metaWriter,
    condition: e => e.endsWith('.nuspec')
  });
  
  console.log('f');
  
  const string = metaWriter.toString();
  console.log(string);
  console.log('g');
  
  return await xml2js(string);
}

async function extractDll(buf, pkgName, cond) {
  const dllWriter = new WritableStream();
  
  await extract(buf, {
    writer: dllWriter,
    condition: cond,
  });
  
  if (shouldFetchDll) {
    await fs.writeFile('./libraries/' + pkgName + '.dll', dllWriter.toBuffer());
  }
}

function findBestDepMatch(metaDeps, compat) {
  if (!metaDeps.length) return {
    $: { targetFramework: compat },
    dependency: []
  };
  
  let f = metaDeps.find(e => e.$.targetFramework == compat);
  if (f) return f;
  
  console.warn('No immediate match',compat,'for dep');
  compat = compat.replace(/[0-9].*/, '');
  let f = metaDeps.filter(e => e.$.targetFramework.startsWith(compat)).sort((a,b) => - naturalSort(a,b));
  if (f.length) return f[0];
  
  console.error('No match at all for',compat,'going with',metaDeps[0].$.targetFramework,'... might be incompatible');
  return metaDeps[0];
}

module.exports = async (compat, dependencies) => {
  await fs.ensureFolder('./libraries');
  dependencies = Object.entries(dependencies).filter(e => !fs.existsSync('./libraries/' + e[0] + '.dll'));
  
  for (let dep of dependencies) {
    console.log('downloading',dep);
    const name = dep[0];
    const version = dep[1];
    
    const buf = await dl(name, version);
    const meta = await extractAndParse(buf);
    
    console.log(meta);
    
    await fs.outputJson('./_debug_meta.json', meta, { spaces: 2 });
    
    const metaDeps = meta.package.metadata[0].dependencies[0].group;
    const bestDeps = findBestDepMatch(metaDeps, compat);
    
    dependencies
  }
};

(async () => {
  await module.exports('.NETFramework4.5', {
    'DSharpPlus': '3.1.2'
  })
})();
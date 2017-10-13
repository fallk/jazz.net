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
  
  await fs.writeFile('./libraries/' + pkgName + '.dll', dllWriter.toBuffer());
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
  let f = metaDeps.filter(e => e.$.targetFramework.startsWith(compat)).sort((a,b) => - naturalSort(a,b));
  if (f.length) return f[0];
  
  console.error('No match at all for',compat,'going with',metaDeps[0].$.targetFramework,'... might be incompatible');
  return metaDeps[0];
}

module.exports = async (compat, dependencies) => {
  await fs.ensureFolder('./libraries');
  dependencies = filterMutating(dependencies, (k,v) => !fs.existsSync('./libraries/' + k + '.dll'));
  
  // repeated iteration as the object is modified
  const iterateds = [];
  let ks = Object.keys(dependencies);
  while (iterateds.length < ks.length) {
    for (let name of ks) {
      if (iterateds.indexOf(name) > -1) continue;
      iterateds.push(name);
      
      const version = dependencies[name];
      console.log('downloading',name,version);
      
      const buf = await dl(name, version);
      const meta = await extractAndParse(buf);
      
      console.log(meta);
      
      await fs.outputJson('./_debug_meta.json', meta, { spaces: 2 });
      
      const metaDeps = meta.package.metadata[0].dependencies[0].group;
      const bestDeps = findBestDepMatch(metaDeps, compat);
      const fw = bestDeps.$.targetFramework;
      console.log(name, ': framework :', fw, ' (expecting', compat, ')');
      
      // package has no deps. we'll have to guess the DLL to extract
      if (fw == 'N/A') {
        // TODO need better guess system, actually looking at the compat and going through the entries..
        // perhaps we can use extractAndParse to output the entries list and we can avoid extracting more than twice...
        extractDll(buf, name, e => true);
        //fs.existsSync('./libraries/' + k + '.dll')
      } else {
        let e;
        if (fw.startsWith('.NETFramework')) {
          // matches: net20, net45, net46
          const holder = 'net' + fw.substring('.NETFramework'.length).replace(/\./g, '').toLowerCase();
          e = f => f.indexOf(holder) > -1;
        } else if (fw.startsWith('.NETPortable')) {
          // matches: portable-net
          e = f => f.indexOf('portable-net') > -1;
        } else if (fw.startsWith('.NETStandard')) {
          // matches: netstandard1.0, netstandard1.3, netstandard2.0
          const holder = fw.substring(1).toLowerCase();
          e = f => f.indexOf(holder) > -1;
        } else {
          // matches: anything!
          e = e => true;
        }
        extractDll(buf, name, e);
      }
      
      // add dependencies to map if not there
      const realDeps = bestDeps.dependency.map(e => e.$);
      for (let d of realDeps) {
        if (d.id in dependencies) {
          if (dependencies[d.id] !== d.version) {
            console.log('VERSION MISMATCH:', d.id, 'using', dependencies[d.id], 'but found', d.version);
          } else {
            dependencies[d.id] = d.version;
          }
        }
      }
    }
    ks = Object.keys(dependencies);
  }
};

(async () => {
  await module.exports('.NETFramework4.5', {
    'DSharpPlus': '3.1.2'
  })
})();
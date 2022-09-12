/**
 * call the real subdivide webworkers routine.
 * manage webworkers.
 *
 *
 *
 */
import {TriMesh} from "../trimesh.js";
import * as test from "./trisubdivide.js";



function Deferred() {
   this.promise = new Promise((resolve, reject)=>{
      this.reject = reject;
      this.resolve = resolve;
   });
}



const _pool = {
   workerList: [],
   queue: [],
   inUse: false,
}
function nextInQueue() {
   if (_pool.inUse) {     // this should always true.
      if (_pool.queue.length === 0) {
         _pool.inUse = false;
      } else {
         const defer = _pool.queue.shift();
         defer.resolve(_pool.workerList);
      }
   }
}
function getComputeList() {
   if (_pool.inUse) {
      const ret = new Deferred();
      _pool.queue.push( ret );

      return ret.promise;
   } else if (_pool.workerList.length === 0) {
      // create the same number of hardwre threads
      for (let i = 0; i < window.navigator.hardwareConcurrency; ++i) {
         let worker = new Worker('./workers/trisubdivide.js', { type: "module" });
         _pool.workerList.push( worker );
      }
   }

   _pool.inUse = true;
   return Promise.resolve(_pool.workerList);
}


async function subdivide(type, source) {
   const subd = TriMesh.create(source._material.depot);
   subd.v._valenceMax = source.v.valenceMax();

   // preallocated enough points to next subdivision level,
   subd.v._allocEx(source.v.length() + source.h.lengthW());
   // preallocated next level of the wEdges/Faces.
   subd.h._allocEx(source.f.length() * 4);   // directedEdge mapped to face 3:1
   subd.h._allocWEdge(source.h.lengthW()*2 + source.f.length()*3);
   subd.f._allocEx(source.f.length() * 4);

   // dehydrate subd, source, and sent it to webworkers
   const sDry = source.getDehydrate({});
   const dDry = subd.getDehydrate({});


   return getComputeList().then(async (computeList)=>{
      let isblocked;
      let waitForAll;
      const workerList = [];
      const resultList = [];
      function getWorker() {
         if (workerList.length) {
            const ret = workerList.shift();
            return Promise.resolve(ret);
         }
         // defereed
         isblocked = new Deferred();
         return isblocked.promise;
      }
      function queueWorker(message) {
         if (isblocked) {
            isblocked.resolve(this);
            isblocked = null;
         } else  {
            workerList.push( this );
            if (waitForAll && (workerList.length === computeList.length)) {
               waitForAll.resolve();
            }
         }
         // push message;
         resultList.push( message.data );
      }
      async function processing(fn, blockSize, allEnd) {
         let start = 0;
         while (start < allEnd) {
            let worker = await getWorker();
            let end = Math.min(allEnd, start+blockSize);
            worker.postMessage({fn: fn, start: start, stop: end});
            start = end;
         }
      }


      // sent dehydrate subd, source to every webWorker.
      let id = 0;
      for (let worker of computeList) {
         worker.onmessage = queueWorker;
         worker.postMessage({fn: type, subd: dDry, source: sDry, id: id});
         worker.id = id++;
      }

      // add/refine middle edge points.
      let blockSize = 256*4;
      await processing("refineEdge", blockSize, source.h.lengthW());

      // copy and setup vertex's hEdge
      blockSize = 256*4;
      await processing("refineVertex", blockSize, source.v.length());

      // fixed-up the wEdges, Faces, and vertex connection.
      blockSize = 256*4;
      await processing("subdivideFace", blockSize, source.f.length());
      blockSize = source.h.length();
      await processing("subdivideHole", blockSize, source.h.length());

      // wait for all workers finished.
      if (workerList.length < computeList.length) {
         waitForAll = new Deferred();
         await waitForAll.promise;
      }

      // release and cleanup webWorker.
      for (let worker of computeList) {
         worker.onmessage = null;
         worker.postMessage({fn: "cleanUp"});
      }

      // resolve() nextInQueue if available.
      nextInQueue();

      return subd;
   });
}

async function subdivideCC(source) {

}

async function subdivideMB(source) {

}


async function subdivideLoop(source, level) {
   let subd = source;

   let text = "";
   let multi = 1;
   for (let i = 0; i < level; ++i) {
      let start = Date.now();

      subd = await subdivide("loop", subd);
      // readjust _material
      multi *= 4;
      //
      text += "(level: " + (i+1) + ", time: " + (Date.now()-start) + ")\n";
      if (0) {
         const sanity = subd.sanityCheck();
         console.log("mesh integrity: " + sanity);
         console.log(subd.stat());
      }
   }
   // readjust _material
   for (let [mat, count] of source.m) {
      subd.m.addRef(mat, count*multi);
   }
   return [subd, text];
}




export {
   subdivideCC,
   subdivideMB,
   subdivideLoop
}

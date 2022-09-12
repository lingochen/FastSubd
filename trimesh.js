/**
   directed edges for triangles(can be used for quads) only meshes. halfEdges with implicit triangles.
   S. Campagna, L. Kobbelt, H.-P. Seidel, Directed Edges - A Scalable Representation For Triangle Meshes , ACM Journal of Graphics Tools 3 (4), 1998.

   The idea of FreeEdge(boundary edge) is the key in making DirectedEdge works like HalfEdge. 
   boundary is handle by negative value and separate array for pairing/next/prev traversal.

   Note: Gino van den Bergen has an interesting implementation. http://www.dtecta.com/files/GDC17_VanDenBergen_Gino_Brep_Triangle_Meshes.pdf
*/

import {BaseMesh, FaceArray, HoleArray, HalfEdgeAttributeArray, VertexArray} from './basemesh.js';
import {Int32PixelArray, Float32PixelArray} from './pixelarray.js';
import {vec3, vec3a} from "./vec3.js";



const dEdgeK = {
   pair: 0,             // positive value to other dEdge, negative value to fEdge
   wEdge: 1,
   vertex: 2,
   //pt: 3,
   sizeOf: 3,
}
Object.freeze(dEdgeK);
const fEdgeK = {
   pair: 0,             // point to dEdge
   prev: 1,             // negative value to fEdge
   next: 2,             // negative value
   hole: 3,             // negative value to hole
   sizeOf: 4,
}
Object.freeze(fEdgeK);
const wEdgeK = {        // wEdgeK, WingedEdgeK/WholeEdgeK
   left: 0,       // the left
   sizeOf: 1,
}
Object.freeze(wEdgeK);
const wEdgeSK = {
   sharpness: 0,	// crease weights is per wEdge, sharpness is float, (int is enough, but subdivision will create fraction, so needs float)
   sizeOf: 1,
}
Object.freeze(wEdgeSK);


// directEdge is 1 triangle as unit, 3 directEdge.
class DirectedEdgeArray extends HalfEdgeAttributeArray {
   constructor(dEdges, fEdges, wEdges, freeBoundaryCount, wFreeList, internal) {
      super(...internal);
      this._dEdges = dEdges;
      this._fEdges = fEdges;
      // TODO: wEdge, freeList 
      this._wEdges = wEdges;
      this._wFreeList = wFreeList;
      this._freeBoundaryCount = freeBoundaryCount;
   }

   static rehydrate(self) {
      if (self._dEdges && self._fEdges && self._wEdges && self._wEdges.left && self._wEdges.sharpness ) {//&& self._freeBoundaryCount) {
         const params = HalfEdgeAttributeArray._rehydrateInternal(self);
         const dEdges = Int32PixelArray.rehydrate(self._dEdges);
         const fEdges = Int32PixelArray.rehydrate(self._fEdges);
         const wEdges = {
            left: Int32PixelArray.rehydrate(self._wEdges.left),
            sharpness: Float32PixelArray.rehydrate(self._wEdges.sharpness),
         };
         return new DirectedEdgeArray(dEdges, fEdges, wEdges, -1, self._freeBoundaryCount, params);
      }
      throw("DirectedEdgeArray rehydrate(): bad input");
   }

   static create(size) {
      const params = HalfEdgeAttributeArray._createInternal(size);

      const dEdges = Int32PixelArray.create(dEdgeK.sizeOf, 3, size*3);
      const fEdges = Int32PixelArray.create(fEdgeK.sizeOf, 3, size);
      fEdges.alloc();   // alloc zeroth for management of free list
      // TODO: wEdge, freeList
      const wEdges = {
         left: Int32PixelArray.create(1, 1, size),
         sharpness: Float32PixelArray.create(1, 1, size),
      };
      const wFreeList = -1;
      const freeBoundaryCount=0;
      return new DirectedEdgeArray(dEdges, fEdges, wEdges, freeBoundaryCount, wFreeList, params);
   }

   getDehydrate(obj) {
      super.getDehydrate(obj);
      obj._dEdges = this._dEdges.getDehydrate({});
      obj._fEdges = this._fEdges.getDehydrate({});
      obj._wEdges = {};
      obj._wEdges.left = this._wEdges.left.getDehydrate({});
      obj._wEdges.sharpness = this._wEdges.sharpness.getDehydrate({});
      obj._freeBoundaryCount = this._freeBoundaryCount;

      return obj;
   }
    
   *[Symbol.iterator] () {
      yield* this.rangeIter(0, this._wEdges.left.length());
   }

   * rangeIter(start, stop) {
      stop = Math.min(this._wEdges.left.length(), stop);
      for (let i = start; i < stop; ++i) {
         // if (!isFree) {
         const left = this._wEdges.left.get(i, 0);
         yield [i, left, this.pair(left)];
         // }
      }
   }
   
   * halfEdgeIter() {
      for (let i = 0; i < this._dEdges.length(); ++i) {
         yield i;
      }
   }

   * boundaryIter() {
      const length = this._fEdges.length();
      for (let i = 1; i < length; ++i) {
         if (this._fEdges.get(i, fEdgeK.hole) < 0) {
            yield -i;
         }
      }
   }

   * _fEdgeIter() {
      for (let i = 1; i < this._fEdges.length(); ++i) {
         yield -i;
      }
   }
   
   alloc() {   // alloc 3 directedEdge.
      super._allocEx(3);   // attribute
      const handle = this._dEdges.allocEx(3);
      // now alloc freeEdges to attach to directed edge.
      const free0 = this.allocBoundaryEdge(),
            free1 = this.allocBoundaryEdge(),
            free2 = this.allocBoundaryEdge();
      // link in reverse relative to dEdge.
      this.linkNext(free0, free2);
      this.linkNext(free2, free1);
      this.linkNext(free1, free0);
      // now set pair
      this.setPair(free0, handle);
      this.setPair(free1, handle+1);
      this.setPair(free2, handle+2);
      
      return handle;
   }

   _allocEx(size) {
      super._allocEx(size*3);
      this._dEdges.allocEx(size*3);
      //this._wEdges.allocEx(size);
   }

   _allocWEdge(size) {
      this._wEdges.left.allocEx(size);
      this._wEdges.sharpness.allocEx(size);
   }

   _allocBEdge(size) {
      this._fEdges.allocEx(size);
   }
   
   allocWEdge(dEdge) {
      this._wEdges.sharpness.alloc();
      const handle = this._wEdges.left.alloc();
      this._wEdges.left.set(handle, 0, dEdge);
      this.setWEdge(dEdge, handle);
      return handle;
   }
   
   _freeWEdge(wEdge) {
      throw("no implementation yet");
   }
   
   allocBoundaryEdge() {
      //return -(this._fEdges.alloc());
      let next = this._fEdges.get(0, fEdgeK.next);
      if (next) { // get from free boundaryEdge first
         const nextNext = this._fEdges.get(-next, fEdgeK.next);
         this._fEdges.set(0, fEdgeK.next, nextNext);
         this._freeBoundaryCount--;
      } else { // allocated a new one. return negative handle.
         next = -(this._fEdges.alloc());
      }
      // remember to set hole to -1
      this._fEdges.set(-next, fEdgeK.hole, -1);
      return next;
   }
   
   freeBoundaryEdge(fEdge) {  // add to freeList.
      this._freeBoundaryCount++;
      const nextNext = this._fEdges.get(0, fEdgeK.next);
      this._fEdges.set(-fEdge, fEdgeK.hole, 0);                // reset as free.
      this._fEdges.set(-fEdge, fEdgeK.next, nextNext);
      this._fEdges.set(0, fEdgeK.next, fEdge);                // fEdge is now head of freeList
   }
   
   isBoundary(dEdge) {
      return (dEdge < 0);
   }
      
   next(dEdge) {
      if (dEdge >= 0) {
         let i = (dEdge+1) % 3;                // remainder.
         dEdge = Math.trunc(dEdge/3) * 3;
         return (dEdge + i);
      } else {
         return this._fEdges.get(-dEdge, fEdgeK.next);
      }
   }
   
   prev(dEdge) {
      if (dEdge >= 0) {
         let i = (dEdge+2) % 3;                // prev
         dEdge = Math.trunc(dEdge/3) * 3;
         return dEdge + i;
      } else {
         return this._fEdges.get(-dEdge, fEdgeK.prev);
      }
   }
   
   linkNext(fEdge, next) {
      if ((fEdge < 0) && (next < 0)) {
         this._fEdges.set(-fEdge, fEdgeK.next, next);
         this._fEdges.set(-next, fEdgeK.prev, fEdge);
      } else {
         throw("linkNext connecting non-boundary directedEdge");
      }
   }

   hole(fEdge) {
      if (fEdge < 0) {
         return this._fEdges.get(-fEdge, fEdgeK.hole);
      } else {
         throw("bad fEdge");
      }
   }

   setHole(fEdge, hole) {
      if (fEdge < 0) {
         this._fEdges.set(-fEdge, fEdgeK.hole, hole);
      } else {
         throw("bad fEdge");
      }
   }
   
   face(dEdge) {
      return Math.trunc(dEdge / 3);
   }

   static faceAndIndex(dEdge) {
      return [Math.trunc(dEdge / 3), dEdge % 3];
   }

   destination(dEdge) {
      if (dEdge < 0) {
         return this.origin( this.pair(dEdge) );
      } else {
         return this.origin( this.next(dEdge) );
      }
   }
   
   position(dEdge) {   // Note: how about boundary edge?
      return this._dEdges.get(dEdge, dEdgeK.vertex);
   }
   
   origin(dEdge) {   // Note: how about boundary edge?
      if (dEdge < 0) {
         return this.destination( this.pair(dEdge) );  
      } else {
         return this._dEdges.get(dEdge, dEdgeK.vertex);
      }
   }
   
   setOrigin(dEdge, vertex) {
      this._dEdges.set(dEdge, dEdgeK.vertex, vertex);
   }

   pair(dEdge) {
      if (dEdge < 0) {
         return this._fEdges.get(-dEdge, fEdgeK.pair);
      } else {
         return this._dEdges.get(dEdge, dEdgeK.pair);
      }
   }

   _setPair(a, b) {
      if (a < 0) {
         this._fEdges.set(-a, fEdgeK.pair, b);
      } else {
         this._dEdges.set(a, dEdgeK.pair, b);
      }
   }
   
   setPair(a, b) {
      this._setPair(a, b);
      this._setPair(b, a);
   }
   
   wEdge(dEdge) {
      if (dEdge >= 0) {
         return this._dEdges.get(dEdge, dEdgeK.wEdge);
      } else {
         // fEdge could use pair's wEdge, 
         dEdge = this._fEdges.get(-dEdge, fEdgeK.pair);
         if (dEdge >= 0) {
            return this._dEdges.get(dEdge, dEdgeK.wEdge);
         }
         return -1;
      }
   }
   
   wEdgeLeft(wEdge) {
      return this._wEdges.left.get(wEdge, 0);
   }
   
   setWEdge(dEdge, wEdge) {
      this._dEdges.set(dEdge, dEdgeK.wEdge, wEdge);
      this._wEdges.left.set(wEdge, 0, dEdge);    // TODO: make sure higher index is the left dEdge, consistency helps in various way
   }

   /**
    * get sharpness from wEdge sharpness.
    * @param {int} dEdge 
    */
   sharpness(dEdge) {
      const wEdge = this.wEdge(dEdge);
      return this.wSharpness(wEdge);
   }

   wSharpness(wEdge) {
      return this._wEdges.sharpness.get(wEdge, 0);
   }

   setSharpness(dEdge, sharpness) {
      const wEdge = this.wEdge(dEdge);
      this.setwSharpness(wEdge, sharpness);
   }

   setwSharpness(wEdge, sharpness) {
      this._wEdges.sharpness.set(wEdge, 0, sharpness);
   }
   
   stat() {
      return "WingedEdge Count: " + this.lengthW() + ";\nDirectedEdge Count: " + this.length() + ";\n";
   }
   
   length() {
      return this._dEdges.length();
   }
   
   lengthW() {
      return this._wEdges.left.length();
   }

   sanityCheck() {
      for (let i = 0; i < this._dEdges.length(); ++i) {
         let pair = this.pair(i);
         if (this.pair(pair) !== i) {
            console.log("bad pair in DirectedEdge: " + i + ", " + pair);
            return false;
         }
         let wEdge = this.wEdge(i);
         if (wEdge !== this.wEdge(pair)) {
            console.log("pair dEdge disgree about wEdge: (" + i + "=>" + wEdge + "), (" + pair + "=>" + this.wEdge(pair)+ ")");
            return false;
         }
         let left = this.wEdgeLeft(wEdge);
         if ( (left !== i) && (left !== pair) ) {
            console.log("wEdge and dEdge disagree: " + wEdge + "=>" + left + "!=(" + i + "," + pair + ")");
            return false;
         } 
      }
      // check freeList
      let freeCount = 0;
      let current = this._fEdges.get(0, fEdgeK.next);
      while (current < 0) {
         current = this._fEdges.get(-current, fEdgeK.next);
         freeCount++;
      }
      if (freeCount !== this._freeBoundaryCount) {
         console.log("FreeCount disagree, expected: " + this._freeBoundaryCount + " got: " + freeCount);
         return false;
      }
      return true;
   }
}


const TriangleK = {
   material: 0,
   sizeOf: 1,
};
Object.freeze(TriangleK);


class TriangleArray extends FaceArray {
   constructor(dEdges, faces, internal) {
      super(...internal);
      this._faces = faces;
      this._dEdges = dEdges;
   }

   static rehydrate(self, dEdges) {
      if (self._faces) {
         const internal = FaceArray._rehydrateInternal(self);
         const faces = Int32PixelArray.rehydrate(self._faces);
         return new TriangleArray(dEdges, faces, internal);
      }
      throw("TriangleArray rehydrate(): bad input");
   }

   static create(materialDepot, dEdges, size) {
      const internal = FaceArray._createInternal(materialDepot, size);
      const faces = Int32PixelArray.create(TriangleK.sizeOf, 4, size);
      return new TriangleArray(dEdges, faces, internal);
   }

   getDehydrate(obj) {
      super.getDehydrate(obj);
      obj._faces = this._faces.getDehydrate({});
      return obj;
   }

   
   // Iterator for the HalfEdge connecting to the triangle.
   * halfEdgeIter(face) {
      face *= 3;
      yield face;
      yield (face+1);
      yield (face+2);
   }
   
   /**
    * similar to array.entries
    * @param {handle} face 
    */
   * halfEdgeEntries(face) {
      face *= 3;
      yield [0, face];
      yield [1, face+1];
      yield [2, face+2];
   }
   
   
   /**
    * triangulate polygon using fan-like method. (simple, flawed but good enough for our case)
    * list of triangles of pull vertex - (hEdgeIndex, ptIndex, materialIndex} - pull vertex.
    */
   makePullBuffer(vertices) {
      let current = 0;
      const triangles = [];
      let length = this._faces.length();
      for (let polygon = 0; polygon < length; ++polygon) {
         let material = this.material(polygon);
 
         triangles.push( current, this._dEdges.origin(current), material );
         current++;
         triangles.push( current, this._dEdges.origin(current), material );
         current++;
         triangles.push( current, this._dEdges.origin(current), material );
         current++;
      }
      
      return new Int32Array(triangles);
   }
   

   _allocEx(count) {
      this._normals.allocEx(count);
      //this.setHalfEdge(handle, -1);  // note: needs?
      return this._faces.allocEx(count);
   }
   
   free(handle) {
      throw("not implemented");
      this._depot.releaseRef(this.material(handle));
      // this._faces.free(handle);
   }
   
   static halfLoop(tri) {
      tri *= 3;
      return [tri, tri+1, tri+2];
   }
   
   halfEdgeCount(_tri) {   // triangle is 3 side
      return 3;
   }
   
   halfEdge(tri) {
      return tri*3;
   }
   
   setHalfEdge(handle) {
      // only for initialiation
   }
   
   material(polygon) {
      return this._faces.get(polygon, TriangleK.material);
   }
   
   _setMaterial(polygon, material) {
      this._faces.set(polygon, TriangleK.material, material);
   }
   
   sanityCheck() {   // halfEdge and Triangle are align automatically, always true.
      for (let face of this) {
         let hEdge = face * 3;
         for (let i = 0; i < 3; ++i) {
            const pair = this._dEdges.pair(hEdge+i);
            if (this._dEdges.isBoundary(pair)) {
               console.log("triangle: " + face + " has boundary: " + pair + " on index: " + i);
            }
         }
      }
      return true;
   }
   
   stat() {
      return "Triangle Count: " + this._faces.length() + ";\n";
   }
   
   length() {
      return (this._faces.length());
   }
   
}

class TriHoleArray extends HoleArray {
   constructor(dEdges, internal) {
      super(dEdges, ...internal);
   }

   static rehydrate(self, dEdges) {
      const params = HoleArray._rehydrateInternal(self);
      return new TriHoleArray(dEdges, params);
   }

   static create(dEdges) {
      const params = HoleArray._createInternal();
      return new TriHoleArray(dEdges, params);
   }

   /*getDehydrate(obj) {
      super.getDehydrate(obj);
      return obj;
   }*/
   
   /**
    * halfEdge is negative Int, so freeList using positive Int
    * @param {negative Int} hole 
    * @returns {bool}
    */
   _isFree(hole) {
      const hEdge = this._holes.get(-hole, 0);
      return (hEdge > 0);
   }


   /** 
    * freeList is using positive Int because HalfEdge is negative Int.
    * @return {negative Int} hole.
    */
   _allocFromFree() {
      let head = this._holes.get(1, 0);
      const newHead = this._holes.get(head, 0);
      this._holes.set(1, 0, newHead);
      this._holes.set(0, 0, this._holes.get(0,0)-1);   // update freecount;
      return -head;
   }

   /** 
    * freeList is using positive Int because HalfEdge is negative Int.
    * @param {negative Int} hole.
    */
   _addToFree(hole) {
      // return to free list
      const oldHead = this._get(1, 0);
      this._holes.set(-hole, 0, oldHead);
      this._holes.set(1, 0, -hole);
      this._holes.set(0, 0, this._holes.get(0,0)+1);   // update freecount;
   }
   
}


function isSame(as, bs) {
   return as.size === bs.size && [...as].every(value => bs.has(value));
}


class TriMesh extends BaseMesh {
   constructor(dEdges, vertices, faces, holes, internal) {
      super(...internal);
      
      this._hEdges = dEdges;
      this._vertices = vertices;
      this._faces = faces;
      this._holes = holes;
   }

   static rehydrate(self) {
      if (self._hEdges && self._vertices && self._faces && self._holes) {
         const params = BaseMesh._rehydrateInternal();
         const dEdges = DirectedEdgeArray.rehydrate(self._hEdges);
         const vertices = VertexArray.rehydrate(self._vertices, dEdges);
         const faces = TriangleArray.rehydrate(self._faces, dEdges);
         const holes = TriHoleArray.rehydrate(self._holes, dEdges);

         return new TriMesh(dEdges, vertices, faces, holes, params);
      }
      throw("TriMesh rehydrate(): bad input");
   }

   static create(materialDepot) {
      const params = BaseMesh._createInternal(materialDepot);

      const dEdges = DirectedEdgeArray.create();
      const vertices = VertexArray.create(dEdges);
      const faces = TriangleArray.create(params[1].proxy, dEdges);
      const holes = TriHoleArray.create(dEdges);

      return new TriMesh(dEdges, vertices, faces, holes, params);
   }

   getDehydrate(obj) {
      super.getDehydrate(obj);
      obj._hEdges = this._hEdges.getDehydrate({});
      obj._vertices = this._vertices.getDehydrate({});
      obj._faces = this._faces.getDehydrate({});
      obj._holes = this._holes.getDehydrate({});

      return obj;
   }

   doneEdit() {
      // walk through all boundaryEdge, assign hole to each boundary group. 
      for (let boundary of this._hEdges.boundaryIter()) {
         let hole = this._hEdges.hole(boundary);
         if (hole === -1) {   // unassigned hEdge, get a new Hole and start assigning the whole group.
            hole = this._holes.alloc();
            this._holes.setHalfEdge(hole, boundary);
            // assigned holeFace to whole group
            let current = boundary;
            do {
               this._hEdges.setSharpness(current, -1);   // boundary is infinite crease.
               this._hEdges.setHole(current, hole);
               current = this._hEdges.next(current);
            } while (current !== boundary);
         }
      }
      // now compute valence and crease.
      this.v.computeValence();
   }
   
   // for debugging purpose.
/*   _gatherEdge(vertex) {
      let outPut = [];
      let fEdges = new Set;
      let dEdges = new Set;
      for (let outEdge of this._vertices.outEdgeIter(vertex)) {
         let inEdge = this._hEdges.pair(outEdge);
         outPut.push( {out: outEdge, in: inEdge} );
         if (this._hEdges.isBoundary(outEdge)){
            fEdges.add(outEdge);
         } else {
            dEdges.add(outEdge);
         }
         if (this._hEdges.isBoundary(inEdge)) {
            fEdges.add(inEdge);
         } else {
            dEdges.add(inEdge);
         }
      }
      return [dEdges, fEdges, outPut];
   }*/
   
   /**
     merging 2 opposite but same boundaryedge.
   */
   _collapseEdge(a, b) {
      let c = this._hEdges.pair(a);
      let d = this._hEdges.pair(b);
      // now safely reassigned
      this._hEdges.setPair(c, d);
      this._hEdges.freeBoundaryEdge(a);
      this._hEdges.freeBoundaryEdge(b); 
      return c;
   }
   
   /**
    * assume normal triangle.
    * @param {*} start 
    * @param {*} end 
    * @param {*} pts 
    * @returns {number, array} - {face, halfLoop}
    */
   addFaceEx(start, end, pts, material) {
      const length = end - start;
      if (length !== 3) { //must be a triangle
         console.log("Bad Triangle: not 3 edges");
         return -1;
      }
          
      // createTriangle directEdge
      const newTri = this._allocTriangle(material);
      const triLoop = TriangleArray.halfLoop(newTri);
      
      let nextIndex = start;
      // find splice freeEdge point.
      const halfLoop = [];
      const freeEdges = [];
      for (let i = start; i < end; ++i) {
         nextIndex = i + 1;
         if (nextIndex === end) {
            nextIndex = start;
         }

         let v0 = pts[i];
         let v1 = pts[nextIndex];
         let [found, edge] = this.findFreeEdge(v0, v1);   // try to find matching freeIn
         if (found && edge >= 0) {  // not finding free edge,
            this._freeTriangle(newTri);
            // This half-edge would introduce a non-manifold condition.
            console.log("non-manifold condition");
            return null;
            // should we rewinded the newly created winged edge? currently nay.
         } else { // yes free Edge for insertion.
            halfLoop.push( edge );
            if (!found) { // insertion point,
               edge = 0;
            }
            freeEdges.push(edge);
         }
      }

      // yeah, we needs to make (in,out) adjacent to properly merge.
      for (let i = 0; i < 3; ++i) {
         let next = (i+1) % 3;
         if (freeEdges[i] < 0 && freeEdges[next] < 0) {
            this.makeAdjacent(freeEdges[i], freeEdges[next]);
         }
      }
      
      // we have to merge boundary first. Insert to gap first will make merging much more complicated
      for (let i = 0; i < length; ++i) {

         this._hEdges.setOrigin(triLoop[i], pts[i+start]);
         let a = freeEdges[i]; 
         if (a < 0) {    // has collapsible pairing free edge
            halfLoop[i] = 1;
            halfLoop[(i+1)%3] = 1;  // yes, handle too.
         
            let b = this._hEdges.pair(triLoop[i]);
         
            let c = this._hEdges.next(a);
            let d = this._hEdges.prev(b);
            // check head for pairing and collapse
            if ( c !== b ) { // not already collapsed
               this._hEdges.linkNext(a, b);
               this._hEdges.linkNext(d, c);
            } 
            
            // check tail for pairing and collapse
            c = this._hEdges.prev(a);
            if (c !== b) { // not already collapsed
               d = this._hEdges.next(b);
               this._hEdges.linkNext(b, a);
               this._hEdges.linkNext(c, d);
            }
            
            // now safely remove the freed-pair, and connect the 2 tri
            c = this._collapseEdge(a, b);
            let wEdge = this._hEdges.wEdge(c);            // use pair's allocated wEdge.
            this._hEdges.setWEdge(triLoop[i], wEdge);
         } else {// remember to allocated wEdge.
            this._hEdges.allocWEdge(triLoop[i]);
         }
      }      
      
      // now insert to gap for the rest of the triangle edges.
      for (let i = 0; i < length; ++i) {
         //this._hEdges.setOrigin(triLoop[i], pts[i+start]);   // already set in merging step
         let a = halfLoop[i];
         if (a === 0) { // isolated vertex, so just point forth and back
            this._vertices.setHalfEdge(pts[i+start], triLoop[i]);
         } else if (a < 0) { // no prevCollapse(spliced), so splice in triangle edge here.         
            let b = this._hEdges.pair(triLoop[i]);
            let c = this._hEdges.prev(a);
            let d = this._hEdges.next(b);
                
            this._hEdges.linkNext(b, a);
            this._hEdges.linkNext(c, d);
         }
      }

      return {face: newTri, hLoop: triLoop};
   }

   
   /**
      try to find the matching pair if any,
   */
   findFreeEdge(v0, v1) {
      let freeEdge = 0;
      for (let outEdge of this._vertices.outEdgeIter(v0)) {
         if (this._hEdges.destination(outEdge) === v1) {
            if (outEdge >= 0) {  // non-free
               return [true, 1];
            }
            return [true, outEdge];
         } else if (this._hEdges.isBoundary(outEdge)) {
            freeEdge = outEdge;
         }
      }
      // return not-found, append after freeEdge if applicable
      return [false, freeEdge];
   }
   
   _allocTriangle(material) {
      const handle = this._faces.alloc(material);
      this._hEdges.alloc();
      return handle;
   }

}






export {
   TriMesh,
   DirectedEdgeArray,
   fEdgeK,
}

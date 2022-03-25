/**
   directed edges for triangles(can be used for quads) only meshes. halfEdges with implicit triangles.
   S. Campagna, L. Kobbelt, H.-P. Seidel, Directed Edges - A Scalable Representation For Triangle Meshes , ACM Journal of Graphics Tools 3 (4), 1998.

   The idea of FreeEdge(boundary edge) is the key in making DirectedEdge works like HalfEdge. 
   boundary is handle by negative value and separate array for pairing/next/prev traversal.

   Note: Gino van den Bergen has an interesting implementation. http://www.dtecta.com/files/GDC17_VanDenBergen_Gino_Brep_Triangle_Meshes.pdf
*/

import {BaseMesh, FaceArray, HalfEdgeAttributeArray, VertexArray} from './basemesh.js';
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
   sizeOf: 3,
}
Object.freeze(fEdgeK);
const wEdgeK = {        // wEdgeK, WingedEdgeK/WholeEdgeK
   left: 0,       // the left
   sharpness: 1,	// crease weights is per wEdge, sharpness is integer
   sizeOf: 2,
}
Object.freeze(wEdgeK);


// directEdge is 1 triangle as unit, 3 directEdge.
class DirectedEdgeArray extends HalfEdgeAttributeArray {
   constructor(size) {
      super(size);
      this._dEdges = new Int32PixelArray(dEdgeK.sizeOf, 3, size*3);
      this._fEdges = new Int32PixelArray(fEdgeK.sizeOf, 3, size);
      this._fEdges.alloc();   // alloc zeroth for management of free list
      // TODO: wEdge, freeList 
      this._wEdges = new Int32PixelArray(wEdgeK.sizeOf, 4, size*2);
      this._wFreeList = -1;
      this._freeBoundaryCount=0;
   }
    
   *[Symbol.iterator] () {
      const length = this._wEdges.length();
      for (let i = 0; i < length; ++i) {
         // if (!isFree) {
         const left = this._wEdges.get(i, wEdgeK.left);
         yield [i, left, this.pair(left)];
         // }
      }
   }
   
   * halfEdgeIter() {
      for (let i = 0; i < this._dEdges.length(); ++i) {
         yield i;
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
      this._wEdges.allocEx(size);
   }
   
   allocWEdge(dEdge) {
      const handle = this._wEdges.alloc();
      this._wEdges.set(handle, wEdgeK.left, dEdge);
      this.setWEdge(dEdge, handle);
      return handle;
   }
   
   _freeWEdge(wEdge) {
      throw("no implementation yet");
   }
   
   allocBoundaryEdge() {
      //return -(this._fEdges.alloc());
      const next = this._fEdges.get(0, fEdgeK.next);
      if (next) { // get from free boundaryEdge first
         const nextNext = this._fEdges.get(-next, fEdgeK.next);
         this._fEdges.set(0, fEdgeK.next, nextNext);
         this._freeBoundaryCount--;
         return next;
      } else { // allocated a new one. return negative handle.
         return -(this._fEdges.alloc());
      }
   }
   
   freeBoundaryEdge(fEdge) {  // add to freeList.
      this._freeBoundaryCount++;
      const nextNext = this._fEdges.get(0, fEdgeK.next);
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
      return this._wEdges.get(wEdge, wEdgeK.left);
   }
   
   setWEdge(dEdge, wEdge) {
      this._dEdges.set(dEdge, dEdgeK.wEdge, wEdge);
      this._wEdges.set(wEdge, wEdgeK.left, dEdge);    // we really don't care who is left, as long as there is one?
   }
   
   stat() {
      return "WingedEdge Count: " + this.lengthW() + ";\nDirectedEdge Count: " + this.length() + ";\n";
   }
   
   length() {
      return this._dEdges.length();
   }
   
   lengthW() {
      return this._wEdges.length();
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
      return true;
   }
}


const TriangleK = {
   material: 0,
   sizeOf: 1,
};
Object.freeze(TriangleK);


class TriangleArray extends FaceArray {
   constructor(materialDepot, dEdges, size) {
      super(materialDepot, size);
      this._faces = new Int32PixelArray(TriangleK.sizeOf, 4, size);
      this._dEdges = dEdges;
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
 
         triangles.push( current, vertices.pt(this._dEdges.origin(current)), material );
         current++;
         triangles.push( current, vertices.pt(this._dEdges.origin(current)), material );
         current++;
         triangles.push( current, vertices.pt(this._dEdges.origin(current)), material );
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
            if (this._dEdges.isBoundary(this._dEdges.pair(hEdge+i))) {
               console.log("triangle: " + face + " has boundary on index: " + i);
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


function isSame(as, bs) {
   return as.size === bs.size && [...as].every(value => bs.has(value));
}


class TriMesh extends BaseMesh {
   constructor(materialDepot) {
      super(materialDepot);
      
      this._hEdges = new DirectedEdgeArray();
      this._vertices = new VertexArray(this._hEdges);
      this._faces = new TriangleArray(this._material.proxy, this._hEdges);
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
}

/**
 fast subd similar ideas to the https://onrendering.com/data/papers/catmark/HalfedgeCatmullClark.pdf
 
 The gist is put HalfEdge onto array, so we can subdivide using index, which make it compatible with gpu eventually.

* http://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm. very nicely written half-edge explanation and pseudo code.
* https://fgiesen.wordpress.com/2012/02/21/half-edge-based-mesh-representations-theory/
* https://fgiesen.wordpress.com/2012/03/24/half-edge-based-mesh-representations-practice/
* https://fgiesen.wordpress.com/2012/04/03/half-edges-redux/ coder's perspective from requirement to implementation.
*
* http://mrl.nyu.edu/~dzorin/ig04/lecture24/meshes.pdf
* winged edge can have consistent orientation of edge. contray to what commonly believed.
* we composed WingedEdge using 2 half edge. slightly easier traversal, don't needs to test for which side we are on.
%% Edge in Wing3d a winged-edge object.
%%
%%                \       /           
%%                 \     /            
%%            ltpr  \   / rtsu        
%%                   \ /              
%%                   ve  b            
%%                    |               
%%                    |               
%%       lf           |          rf   
%%                    |               
%%                    |               
%%                 a  vs              
%%                   / \              
%%            ltsu  /   \ rtpr        
%%                 /     \            
%%                /       \           
%%                             
* our face is oriented counter clockwise.  
*
*/

import {BaseMesh, FaceArray, HalfEdgeAttributeArray, VertexArray, HoleArray} from './basemesh.js';
import {Int32PixelArray, Float32PixelArray} from './pixelarray.js';
import {vec3, vec3a} from "./vec3.js";




const HalfEdgeK = {   // handle location
   prev: 0,         // we need this because addFace needs prev() to splice, and it pretty expensive or complicated to provide prev
   next: 1,
   face: 2,
   vertex: 3,
   //uv: 8,	// uv trait allocated separately?
   sizeOf: 4,   // 5 int32, minimum
   wEdge: (hEdge)=>{return Math.trunc(hEdge/2);},
   isOdd: (hEdge)=>{return hEdge%2;},
};
Object.freeze(HalfEdgeK);
const WingedEdgeK = {
   sharpness: 0,	// crease weights is per wEdge, sharpness is float, (int is enough, but subdivision will create fraction)
   sizeOf: 1,
}
Object.freeze(WingedEdgeK);


class HalfEdgeArray extends HalfEdgeAttributeArray {
   constructor(size) {
      super(size);
      this._hEdges = new Int32PixelArray(HalfEdgeK.sizeOf, 4, size*2);       // structSize, numberOfChannel
      this._wEdges = new Float32PixelArray(WingedEdgeK.sizeOf, 1, size);
      this._wFree = {head: 0, size: 0}                 
   }
   
   *[Symbol.iterator] () {
      const length = this._wEdges.length();
      for (let i = 0; i < length; ++i) {
         if (!this.isFree(i)) {
            yield [i, i*2, i*2+1];
         }
      }
   }

   * halfEdgeIter() {
      const length = this._wEdges.length(); // each wEdge is 2 halfEdge
      for (let i = 0; i < length; i++) {
         if (!this.isFree(i)) {
            yield i*2;
            yield i*2+1;
         }
      }
   }

   * _freewEdgeIter() {
      if (this._wFree.size > 0) {
         let current = this._wFree.head;
         while (current !== 0) {
            let wEdge = (-current)-1;
            yield wEdge;
            current = this._wEdges.get(wEdge, 0);
         }
      }
   }
   
   // 
   alloc() {
      // TODO: alloc from free first.
      super._allocEx(2);
      const left = this._hEdges.alloc();
      const right = this._hEdges.alloc();
      this._wEdges.alloc();
      this._attrs.alloc(); this._attrs.alloc();
      this._uvs.alloc(); this._uvs.alloc();
      this.linkNext(left, right);
      this.linkNext(right, left);
      return left;
   }
   
   _allocEx(size) {
      super._allocEx(size*2);
      this._hEdges.allocEx(size*2);
      this._wEdges.allocEx(size);
   }
   
   free(hEdge) {  // given the hEdge, free the wEdge.
      const wEdge = HalfEdgeK.wEdge(hEdge);
      this._wEdges.set(wEdge, 0, this._wFree.head);
      this._wFree.head = -(wEdge+1);
      this._wFree.size--;
   }

   _linkFree(wEdge, prevFree) {  // to be used by subdivide().
      this._wEdges.set(wEdge, 0, -(prevFree+1));
   }

   _concatFree(tail, head, size) {  // to be used by subdivide()
      this._wEdges.set(tail, 0, this._wFree.head);
      this._wFree.head = -(head+1);
      this._wFree.size += size;
   }
   
   isBoundary(hEdge) {
      return this._hEdges.get(hEdge, HalfEdgeK.face) < 0;
   }

   isFree(wEdge) {
      return  (this._wEdges.get(wEdge, 0) < 0);
   }

   prev(hEdge) {
      return this._hEdges.get(hEdge, HalfEdgeK.prev);
   }

   next(hEdge) {
      return this._hEdges.get(hEdge, HalfEdgeK.next);
   }
   
   linkNext(hEdge, next) {
      this._hEdges.set(hEdge, HalfEdgeK.next, next);
      this._hEdges.set(next, HalfEdgeK.prev, hEdge);
   }
   
   face(hEdge) {
      return this._hEdges.get(hEdge, HalfEdgeK.face);
   }
   
   setFace(hEdge, face) {
      this._hEdges.set(hEdge, HalfEdgeK.face, face);
   }

   position(hEdge) {
      //return this._hEdges.get(hEdge, HalfEdgeK.pt);
      return this._hEdges.get(hEdge, HalfEdgeK.vertex);
   }
      
   destination(hEdge) {
      const pair = this.pair(hEdge);
      return this.origin(pair);
   }
   
   origin(hEdge) {
      return this._hEdges.get(hEdge, HalfEdgeK.vertex);
   }
   
   setOrigin(hEdge, vertex) {
      this._hEdges.set(hEdge, HalfEdgeK.vertex, vertex);
   }
      
   pair(hEdge) {  // could be static
      const isOdd = hEdge % 2;
      if (isOdd) {
         return hEdge - 1;
      } else {
         return hEdge + 1;
      }
   }   
   
   wEdge(hEdge) {
      return Math.trunc(hEdge/2);
   }

   /**
    * get sharpness from wEdge sharpness.
    * @param {int} hEdge 
    */
   sharpness(hEdge) {
      const wEdge = this.wEdge(hEdge);
      return this._wEdges.get(wEdge, WingedEdgeK.sharpness);
   }

   setSharpness(hEdge, sharpness) {
      const wEdge = this.wEdge(hEdge);
      this._wEdges.set(wEdge, WingedEdgeK.sharpness, sharpness);
   }
   
   stat() {
      return "HalfEdge Count: " + this._hEdges.length() + "; Free wEdge Count: " + this._wFree.size + ";\n";
   }
   
   length() {
      return this._hEdges.length();
   }
   
   lengthW() {
      return this._hEdges.length()/2;
   }

   sanityCheck() {
      return true;
   }
}




const PolygonK = {
   hEdge: 0,      // point to tail, and start from head.
   material:1 ,   // list(and uv), allocated separately?
   // cache
   //normal: 2,
   //tangent: 3,
   sizeOf: 2,
   isHole: (face)=>{return (face<0);},
}
Object.freeze(PolygonK);


class PolygonArray extends FaceArray {
   constructor(materialDepot, hEdges, size) {
      super(materialDepot, size);
      this._faces = new Int32PixelArray(PolygonK.sizeOf, 4, size);
      this._hEdges = hEdges;
   }

   // Iterator for the HalfEdge connecting the Polygon.
   * halfEdgeIter(face) {
      const hEdges = this._hEdges;
      const start = this.halfEdge(face);
      let current = start;
      do {
         yield current;
         current = hEdges.next(current);
      } while (current !== start);
   }

   /**
    * similar to array.entries
    * @param {handle} face 
    */
   * halfEdgeEntries(face) {
      let index = 0;
      for (let hEdge of this.halfEdgeIter(face)) {
         yield [index++, hEdge];
      }
   }
   
   /**
    * triangulate polygon using fan-like method. (simple, flawed but good enough for our case)
    * list of triangles of pull vertex - (hEdgeIndex, ptIndex, materialIndex} - pull vertex.
    */
   makePullBuffer(vertices) {
      const triangles = [];
      let length = this._faces.length();
      for (let polygon = 0; polygon < length; ++polygon) {
         let material = this.material(polygon);
         let currentIdx = 0;
         
         for (let hEdge of this.halfEdgeIter(polygon)) {
            if (currentIdx++ > 2) {   // copy the last virtual edge
               let v0 = triangles.length - (3*3);
               let v1 = triangles.length - 3;
               triangles.push( triangles[v0], triangles[v0+1], triangles[v0+2],
                               triangles[v1], triangles[v1+1], triangles[v1+2] );
            }
            triangles.push( hEdge, vertices.pt(this._hEdges.origin(hEdge)), material );
         }
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
   
   halfEdgeCount(polygon) {
      let count = 0;
      for (let _hEdge of this.halfEdgeIter(polygon)) {
         ++count;
      }
      return count;
   }
   
   halfEdge(polygon) {
      return this._faces.get(polygon, PolygonK.hEdge);
   }
   
   setHalfEdge(polygon, hEdge) {
      this._faces.set(polygon, PolygonK.hEdge, hEdge);
   }
   
   material(polygon) {
      return this._faces.get(polygon, PolygonK.material);
   }
   
   _setMaterial(polygon, material) {
      this._faces.set(polygon, PolygonK.material, material);
   }
   
   sanityCheck() {
      let sanity = true;
      let length = this._faces.length();
      for (let polygon = 0; polygon < length; ++polygon) {
         for (let hEdge of this.halfEdgeIter(polygon)) {
            if (this._hEdges.face(hEdge) !== polygon) {
               sanity = false;
               break;
            }
         }
      }
      return sanity;
   }
   
   stat() {
      return "Polygon Count: " + this._faces.length() + ";\n";
   }
   
   length() {
      return (this._faces.length());
   }
}


class PolyHoleArray extends HoleArray {
   constructor(mesh) {
      super(mesh);
      // zeroth, is freeList count, 1st element is freeList head, // real hole start from 2nd element.
      // this._holes.set(1, 0, 0); // 
   }

   /**
    * halfEdge is positive Int 
    * @param {negative Int} hole 
    * @returns {bool}
    */
   _isFree(hole) {
      const hEdge = this._holes.get(-hole, 0);
      return (hEdge < 0);
   }

   _allocFromFree() {
      let head = this._holes.get(1, 0);
      const newHead = this._holes.get(-head, 0);
      this._holes.set(1, 0, newHead);
      this._holes.set(0, 0, this._holes.get(0,0)-1);   // update freecount;
      return head;
   }

   _addToFree(hole) {
      // return to free list
      const oldHead = this._get(1, 0);
      this._holes.set(-hole, 0, oldHead);
      this._holes.set(1, 0, hole);
      this._holes.set(0, 0, this._holes.get(0,0)+1);   // update freecount;
   }
}





// Geometry using Halfedge(of WingedEdge) 
class PolyMesh extends BaseMesh {
   constructor(materialDepot) {     
      super(materialDepot);
    
      this._hEdges = new HalfEdgeArray();
      this._vertices = new VertexArray(this._hEdges);
      this._faces = new PolygonArray(this._material.proxy, this._hEdges);
      this._holes = new PolyHoleArray(this);
   };

   doneEdit() {
      // walk through all wEdges, assign hole to each hEdge group. 
      for (let hEdge of this._hEdges.halfEdgeIter()) {
         let face = this._hEdges.face(hEdge);
         if (face === -1) {   // unassigned hEdge, get a new Hole and start assigning the whole group.
            const hole = this._holes.alloc();
            this._holes.setHalfEdge(hole, hEdge);
            // assigned holeFace to whole group
            let current = hEdge;
            do {
               this._hEdges.setSharpness(current, -1);   // boundary is infinite crease.
               this._hEdges.setFace(current, hole);
               current = this._hEdges.next(current);
            } while (current !== hEdge);
         }
      }
      // now compute valence and crease
      this.v.computeValence();
   }
   
   addFaceEx(start, end, pts, material) {
      const length = end - start;
      if (length < 3) { // at least a triangle
         console.log("Bad polygon: less than 3 edges");
         return -1;
      }

      const newPolygon = this._allocPolygon(material);

      const hEdges = this._hEdges;
      let prevHalf = -1;
      let nextHalf = -1;
      let nextIndex = start;
      // builds WingEdge if not exist
      const halfLoop = [];
      const newEdges = [];
      for (let i = start; i < end; ++i) {
         nextIndex = i + 1;
         if (nextIndex === end) {
            nextIndex = start;
            nextHalf = halfLoop[0];
         }

         let v0 = pts[i];
         let v1 = pts[nextIndex];
         let hEdge = this.findHalfEdge(v0, v1);
         if (hEdge < 0) { // not found, create one
            hEdge = this._addEdgeEx(v0, v1, prevHalf, nextHalf);
            if (hEdge < 0) {
               this._unwindNewEdges(newPolygon, newEdges, halfLoop);
               return -1;
            }
            newEdges.push(hEdge);
         } else if (!hEdges.isBoundary(hEdge)) { // is it free? only free can form a chain.
            this._unwindNewEdges(newPolygon, newEdges, halfLoop);
            // This half-edge would introduce a non-manifold condition.
            console.log("non-manifold condition, no boundary");
            return -1;
         }
         prevHalf = hEdge;
         halfLoop.push( hEdge );
         this._hEdges.setFace(hEdge, newPolygon);  // mark as used to prevent complex polygon,
      }

      // Try to reorder the links to get proper orientation.
      for (let i = 0; i < length; ++i) {
         nextIndex = i + 1;
         if (nextIndex === length) {
            nextIndex = 0;
         }

         if (!this.makeAdjacent(halfLoop[i], halfLoop[nextIndex])) {
            this._unwindNewEdges(newPolygon, newEdges, halfLoop);
            // The polygon would introduce a non-manifold condition.
            console.log("non-manifold condition, cannot splice");
            return -1;
         }
      }

      //// Link half-edges to the polygon.
      this._faces.setHalfEdge(newPolygon, halfLoop[0]);

      return {face: newPolygon, hLoop: halfLoop};
   }
   
   // failed addPolygon. free and unlink edges, and unset face
   _unwindNewEdges(polygon, halfEdges, halfLoop) {
      this._freePolygon(polygon);
      // free WingedEdge
      const hEdges = this._hEdges;
      const vertices = this._vertex;
      for (let halfEdge of halfEdges) {
         let pair = hEdges.pair(halfEdge);
         vertices.unlinkEdge( hEdges.origin(halfEdge), pair);
         vertices.unlinkedge( hEdges.origin(pair), halfEdge);
         this._freeEdge(halfEdge);
      }
      // unset face.
      for (let hEdge of halfLoop) {
         this._hEdges.setFace(hEdge, -1);
      }
   }
   
   // return HalfEdge ptr for internal use only.
   _addEdgeEx(begVert, endVert, prevHalf, nextHalf) {
      // initialized data.
      const left = this._createEdge(begVert, endVert);
      if (left < 0) {
         return -1;
      }
      const right = left + 1;

      // link outedge, splice if needed
      const hEdges = this._hEdges;
      const vertices = this._vertices;
      if (prevHalf >= 0) {    // splice directly to prevHalf
         hEdges.linkNext( right, hEdges.next(prevHalf) );  //edge.right.next = prevHalf.next;
         hEdges.linkNext( prevHalf, left );                //prevHalf.next = edge.left;
      } else if (!vertices.linkEdge(begVert, left, right)) {
         // release the edge
         this._freeEdge(left);
         return -1;
      }
      
      if (nextHalf >= 0) {    // Link inedge, splice
         hEdges.linkNext( hEdges.prev(nextHalf), right );  // prev.next = edge.right;
         hEdges.linkNext( left, nextHalf );                // edge.left.next = nextHalf
      } else if (!vertices.linkEdge(endVert, right, left)) {
         vertices.unlinkEdge(begVert, left, right);
         // release the endge
         this._freeEdge(right);
         return -1; 
      }

      // return outEdge.
      return left;
   };
   
   _createEdge(begVert, endVert) {
      const left = this._hEdges.alloc();
      const right = left + 1;
      
      this._hEdges.setOrigin(left, begVert);
      this._hEdges.setFace(left, -1);
      this._hEdges.setOrigin(right, endVert);
      this._hEdges.setFace(right, -1);

      // orient vertex.outEdge to the smalles id
      //this.addAffectedVertex(begVert).addAffectedVertex(endVert);
      //begVert.orient(outEdge);
      //endVert.orient(outEdge.pair);
      return left;
   }
   
   /**
     
   */
   _freePolygon(polygonId) {
      //this._faces.setHalfEdge(polygonId, -1);
      this._faces.free(polygonId);
   }
   
   _allocPolygon(material) {
      return this._faces.alloc(material);
   }

}




export {
   PolyMesh,
   PolygonK,
   HalfEdgeK,
}

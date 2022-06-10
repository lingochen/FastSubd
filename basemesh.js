/**
 * The base class for PolyMesh and TriMesh. 
 *  mainly to provide Uint32Array and Float32Array for use.
 * @module BaseMesh
 * 
*/
import {Int32PixelArray, Float32PixelArray, Float16PixelArray, TexCoordPixelArray3D} from './pixelarray.js';
import {vec3, vec3a} from "./vec3.js";


const HalfEdgeAttrK = {
   color: 0,
   normal: 3,
   //tangent: 6,
   sizeOf: 6,
}
Object.freeze(HalfEdgeAttrK);


class HalfEdgeAttributeArray {
   constructor(size) {
      this._attrs = new Float16PixelArray(HalfEdgeAttrK.sizeOf, 3, size*2);
      this._uvs = new TexCoordPixelArray3D(1, size);
   }

   _allocEx(size) {
      this._attrs.allocEx(size);
      this._uvs.allocEx(size);
   }

   /**
    * compute all hEdge normal.
    * @param {array} vertices 
    */
    computeNormal(vertices) {
      const positions = vertices.positionBuffer();
      let a0, a1, a2, b0, b1, b2;
      const surfaceNormal = (hEdge, norm)=>{
         let v0 = this.position( this.prev(hEdge) ) * 3;
         let v1 = this.position( hEdge ) * 3;
         let v2 = this.position( this.next(hEdge) ) * 3;
         a0 = positions[v1] - positions[v0]; 
         a1 = positions[v1+1]-positions[v0+1];
         a2 = positions[v1+2]-positions[v0+2];
         b0 = positions[v2] - positions[v0]; 
         b1 = positions[v2+1]-positions[v0+1]; 
         b2 = positions[v2+2]-positions[v0+2];
         norm[0] = (a1*b2) - (a2*b1);
         norm[1] = (a2*b0) - (a0*b2);
         norm[2] = (a0*b1) - (a1*b0);
         return vec3a.normalize(norm, 0);
      }

      let normal = [0, 0, 0];
      for (let hEdge of this.halfEdgeIter()) {
         // compute Normal
         surfaceNormal(hEdge, normal);
         this.setNormal(hEdge, normal);
         //surfaceNormal(right, normal);
         //this.setNormal(right, normal);
      }
   }

   createAttributeTexture(gl) {
      return this._attrs.createDataTexture(gl);
   }
   
   createUvsTexture(gl) {
      return this._uvs.createDataTexture(gl);
   }
   
   createAttributeInterpolator() {
      let color = [0, 0, 0];
      let normal = [0, 0, 0];
      let uvs = [];
      for (let i = 0; i < this._uvs.depth(); ++i) {
         uvs.push( [0, 0] );
      }
      
      return new AttributeInterpolator(this, color, normal, uvs);
   }
   
   addAttrTo(attr, hEdge) {
      // add color, normal?

      // add uv
      for (let i = 0; i < attr.uvs.length; ++i) {
         this._uvs.addTo(attr.uvs[i], hEdge, i);
      }
   }
   
   getAttr(hEdge, attr) {
      // this.getColor(hEdge, attr.color);
      for (let i = 0; i < attr.uvs.length; ++i) {
         this._uvs.get(hEdge, i, attr.uvs[i]);
      }
   }
   
   setAttr(hEdge, attr) {
      //this.setColor(hEdge, attr.color);
      for (let i = 0; i < attr.uvs.length; ++i) {
         this.setUV(hEdge, i, attr.uvs[i]);
      }
   }

      
   setUV(hEdge, layer, uv) {
      this._uvs.set(hEdge, layer, uv);
   }

   setNormal(hEdge, normal) {
      this._attrs.setVec3(hEdge, HalfEdgeAttrK.normal, normal);
   }

   /**
    DirectedEdge will override
    */
   hole(hEdge) {
      return this.face(hEdge);
   }
}

class AttributeInterpolator {
   constructor(hEdges, color, normal, uvs) {
      this._hEdges = hEdges;
      this._attr = {color, normal, uvs};
   }

   add(hEdge) {
      this._hEdges.addAttrTo(this._attr, hEdge);
   }

   interpolate(divisor) {
      //let divisor = 1.0 / count;
      //this._attr.color[0] *= divisor;
      //this._attr.color[1] *= divisor;
      //this._attr.color[2] *= divisor;
      
      for (let uv of this._attr.uvs) {
         uv[0] *= divisor;
         uv[1] *= divisor;
      }
   }

   copyTo(dest, hEdge) {
      dest.h.setAttr(hEdge, this._attr);
   }

   reset() {
      this._attr.color[0] = this._attr.color[1] = this._attr[2] = 0;
      for (let uv of this._attr.uvs) {
         uv[0] = uv[1] = 0;
      }
   }
   
   init(hEdge) {
      this._hEdges.getAttr(hEdge, this._attr);
   }
}




const PointK = {
   x: 0,
   y: 1,
   z: 2,
   sizeOf: 3,
};
Object.freeze(PointK);
const VertexK = {
   hEdge: 0,
   pt: 1,
   valence: 2,
   crease: 3,     // (-1=corner, 3 edge with sharpness), (0=smooth, 0 or 1 edge with sharpness), (1=crease, 2 edge with sharpness))
   // cache, 
   //normal: 3,
   //tangent: 3,
   sizeOf: 4,
}
Object.freeze(VertexK);


class VertexArray {
   constructor(hEdges, size) {
      this._vertices = new Int32PixelArray(VertexK.sizeOf, 4, size);
      this._pts = new Float32PixelArray(PointK.sizeOf, 3, size);
      this._hEdges = hEdges;
      this._valenceMax = 0;
   }
   
   *[Symbol.iterator] () {
      const length = this._vertices.length();
      for (let i = 0; i < length; ++i) {
         if (!this.isFree(i)) {
            yield i;
         }
      }
   }
   
   * outEdgeIter(vert) {
      const hEdges = this._hEdges;
   
      const start = this._vertices.get(vert, VertexK.hEdge);
      if (start >= 0) {
         let current = start;
         do {
            const outEdge = current;
            const pair = hEdges.pair(current);
            current = hEdges.next( pair );
            yield outEdge;
         } while (current !== start);
      }
   }
   
   // ccw ordering
   * inEdgeIter(vert) {
      const hEdges = this._hEdges;
   
      const start = this._vertices.get(vert, VertexK.hEdge);
      if (start >= 0) {
         let current = start;
         do {
            const inEdge = hEdges.pair(current);
            current = hEdges.next( hEdges.pair(current) );
            yield inEdge;
         } while (current !== start);
      }
   }

   createPositionTexture(gl) {
      return this._pts.createDataTexture(gl);
   }
   
   makePositionBuffer() {
      return this._pts.makeUsedBuffer();
   }
   
   positionBuffer() {
      return this._pts.getBuffer();
   }

   // the maximum valence ever in this VertexArray.
   valenceMax() {
      return this._valenceMax;
   }

   valence(vertex) {
      return this._vertices.get(vertex, VertexK.valence);
   }
   
   setValence(vertex, valence) {
      this._vertices.set(vertex, VertexK.valence, valence);
   }

   computeValence() {
      let valenceMax = 0;
      for (let i of this) {
         const start = this._vertices.get(i, VertexK.hEdge);
         if (start >= 0) {
            let count = 0;
            let current = start;
            let sharpness = 0;
            let creaseCount = 0;
            do {
               if (creaseCount < 3) {
                  let value = this._hEdges.sharpness(current);
                  if (value > 0) {
                     sharpness += value;
                     creaseCount++;
                  } else if (value < 0) { // boundaryEdge create corner like condition.
                     creaseCount = 3;
                  }
               }
               const pair = this._hEdges.pair(current);
               current = this._hEdges.next( pair );
               count++;
            } while (current !== start);
            if (count > valenceMax) {
               valenceMax = count;
            }
            this._vertices.set(i, VertexK.valence, count);
            if (creaseCount > 2) {
               this._vertices.set(i, VertexK.crease, -1);
            } else if (creaseCount == 2) {
               this._vertices.set(i, VertexK.crease, sharpness/2.0);
            } else {
               this._vertices.set(i, VertexK.crease, 0);
            }

         }
      }
      this._valenceMax = valenceMax;
   }

   alloc() {
      const vertex = this._vertices.alloc();
      this._pts.alloc();
      this._vertices.set(vertex, VertexK.pt, vertex);
      return vertex;
   }
   
   _allocEx(size) {
      const start = this.length();
      this._vertices.allocEx(size);
      this._pts.allocEx(size);
      const end = start + size;
      // copy location, TODO: comeback for non-maniford case
      for (let i = start; i < end; ++i) {
         this._vertices.set(i, VertexK.pt, i);
      }
   }

   isFree(vert) {
      return (this._vertices.get(vert, VertexK.hEdge) < 0);
   }

   copyPt(vertex, inPt, inOffset) {
      const pt = this._vertices.get(vertex, VertexK.pt);
      vec3.copy(this._pts.getBuffer(), pt * PointK.sizeOf, inPt, inOffset);
   }
   
   pt(vert) {
      return this._vertices.get(vert, VertexK.pt);
   }
   
   halfEdge(vert) {
      return this._vertices.get(vert, VertexK.hEdge);
   }
   
   setHalfEdge(vert, hEdge) {
      this._vertices.set(vert, VertexK.hEdge, hEdge);
   }
   
   findFreeInEdge(vert) {
      const hEdges = this._hEdges;
   
      for (let inEdge of this.inEdgeIter(vert)) {
         if (hEdges.face(inEdge) < 0) {
            return inEdge;
         }
      }
      return -1;
   }
   
   linkEdge(vert, outHalf, inHalf) {  // outHalf,inHalf of wEdge
      if (vert < 0) {
         return false;
      }
      const outEdge = this.halfEdge(vert);
      if (outEdge < 0) { // isolated vertex.
         this.setHalfEdge(vert, outHalf);
      } else {
         const inEdge = this.findFreeInEdge(vert);
         if (inEdge < 0) {
            console.log("Error: Vertex.linkEdge: complex vertex " + vert);
            return false;
         }
         const hEdges = this._hEdges;
         // else insert into circular list.
         const nextHf = hEdges.next(inEdge);
         hEdges.linkNext( inEdge, outHalf);
         hEdges.linkNext( inHalf, nextHf);
         if (outHalf < outEdge) {   // check for minimal 
            this.setHalfEdge(outHalf);
         }
      }
      // link edge successful
      return true;
   }
   
   unlinkEdge(vert, outHalf, inHalf) {  // outHalf/inHalf of wEdge.
      const hEdges = this._hEdges;
      const prev = hEdges.prev(outHalf);
      if (prev < 0) {
         throw("Error: no Prev hEdge");
      }
      if (this.halfEdge(vert) === outHalf) {
         if (prev === inHalf) {
            this.setHalfEdge(vert, -1);
            return;
         }
         
         this.setHalfEdge(vert, hEdges.pair(prev));
         //this.reorient(vert);
      }
      // remove from circular list.
      hEdges.linkNext( prev, hEdges.next(inHalf) );
   }

   sanityCheck() {
      let sanity = true;
      for (let vertex of this) {
         let outEdge = this.halfEdge(vertex);
         if (outEdge < 0) {   // not initialized yet
            break;
         }
         let expect = this._hEdges.origin(outEdge);
         if (expect !== vertex) {
            console.log("vertex " + vertex + "'s outEdge " + outEdge + " is wrong, expected: " + expect);
            sanity = false;
         } else { // check prev,next are the same. 
            let iterationCount = 0;    // make sure, no infinite loop
            for (let outEdge of this.outEdgeIter(vertex)) {
               let next = this._hEdges.next(outEdge);
               if (this._hEdges.prev(next) !== outEdge) {
                  console.log("vertex: " + vertex + "'s (next,prev) is broken");
                  sanity = false;
                  break;
               }
               if (iterationCount++ >= 1024) {
                  console.log("vertex: " + vertex + " has more than 1024 edges, might be broken");
                  sanity = false;
                  break;
               }
            }
         }
      }
      // now check polygon?
      
      return sanity;
   };
   
      
   stat() {
      return "Vertices Count: " + this._vertices.length() + ";\n";
   }
   
   length() {
      return this._vertices.length();
   }
   
   lengthPt() {
      return this._pts.length();
   }
}



class FaceArray {
   constructor(materialDepot, size) {
      this._normals = new Float32PixelArray(3, 3, size);
      this._depot = materialDepot;
   }
   
   *[Symbol.iterator] () {
      for (let i = 0; i < this.length(); ++i) {
         yield i;
      }
   }
      
   alloc(material) {
      const handle = this._allocEx(1);
      if (material == null) {
         material = this._depot.getDefault();
      }
      this.setMaterial(handle, material);
      this._depot.addRef(material);
      return handle;
   }
      
   _materialAddRef(material, count) {
      this._depot.addRef(material, count);
   }

   setMaterial(polygon, material) {
      let oldMaterial = this.material(polygon);
      if (oldMaterial !== material) {
         this._setMaterial(polygon, material);
         this._depot.releaseRef(oldMaterial);
         this._depot.addRef(material);
      }
   }

   normal(polygon, normal) {
      this._normals.getVec3(polygon, 0, normal);
      return normal;
   }

   setNormal(polygon, normal) {
      this._normal.setVec3(polygon, 0, normal);
   }
}


/**
 * hole has to start from -2, because -1 is for unassigned hole.
 */
class HoleArray {
   constructor(mesh) {
      this._mesh = mesh;
      this._holes = new Int32PixelArray(1,1);
      // zeroth is freeCount, 1st element is free head list, real hole start from 2nd element.
      // this._holes.set(1, 0, -1);
      this._holes.allocEx(2);  // preallocated [size, freeHead] if any
   }

   /**
    * assumed this is pristine, reconstruct hole from another one, used by subdivide.
    * @param {HoleArray} src
    */
   _copy(src) {
      const srcLen = src._holes.length();
      this._holes.allocEx(srcLen - this._holes.length());
      // now copy everything.
      for (let i = 0; i < srcLen; ++i) {
         this._holes.set(i, 0, src._holes.get(i, 0));
      }
   }

   
   *[Symbol.iterator] () {
      const len = this._holes.length();
      for (let i = 2; i < len; ++i) {
         if (!this._isFree(-i)) {
            yield -i;
         }
      }
   }

   * halfEdgeIter(hole) {
      const hEdges = this._mesh.h;
      const start = this.halfEdge(hole);
      let current = start;
      do {
         yield current;
         current = hEdges.next(current);
      } while (current !== start);
   }

   _hasFree() {
      return (this._holes.get(0, 0) > 0);
   }

   alloc() {
      // check free list first,
      if (this._hasFree()) {
         return this._allocFromFree();
      } else {
         let handle = this._holes.alloc();
         return (-handle);
      }
   }

   free(handle) {
      if (handle < -1) {
         this._addToFree(handle);
      }
   }

   halfEdge(handle) {
      if (handle < -1) {
         return this._holes.get(-handle, 0);
      } else {
         throw("invalid hole: " + handle);
      }
   }

   setHalfEdge(handle, hEdge) {
      if (handle < -1) {
         this._holes.set(-handle, 0, hEdge);
      } else {
         throw("invalid hole: " + handle);
      }
   }

   sanityCheck() {
      const hEdges = this._mesh.h;
      let sanity = true;
      for (let hole of this) {
         for (let hEdge of this.halfEdgeIter(hole)) {
            if (hEdges.hole(hEdge) !== hole) {
               sanity = false;
               break;
            }
         }
      }
      return sanity;
   }

   stat() {
      return "Holes Count: " + (this._holes.length()-2) + ";\n";
   }
}



/**
 * name group for collection of faces.
 */
class NameGroup {
   constructor(name, start) {
      this._name = name;
      this._faces = {start: start, end: start+1};    // restriction to continus faces, should be an array of faces to be more flexible.
   }

   finalize(end) {
      //this._faces.start = start;
      this._faces.end = end;
   }
}



/** abstract class representing Mesh. managing material and groupNode */
class BaseMesh {
   constructor(materialDepot) {
      this._nonManifold = false;
      this._bin = {nameGroup:[], };
      
      this._material = {depot: materialDepot};
      const warehouse = new Map
      this._material.used = warehouse;
      this._material.proxy = {                    // TODO: use real proxy?
         addRef: (material)=> {
            materialDepot.addRef(material);
            let count = warehouse.get(material);
            if (count === undefined) {
               warehouse.set(material, 1);
            } else {
               warehouse.set(material, count+1);
            }
         },
       
         releaseRef: (material)=> {
            materialDepot.releaseRef(material);
            let count = warehouse.get(material);
            count--;
            if (count) {
               warehouse.set(material, count);
            } else {
               warehouse.delete(material);
            }
         },
       
         getDefault: ()=> {
            return materialDepot.getDefault();
         },
      };      
   }
   
      
   makePullBuffer(gl) {
      this.h.computeNormal(this._vertices);
      
      const pullVertex = this.f.makePullBuffer(this._vertices);
   
      const positionTexture = this.v.createPositionTexture(gl);
      const attrsTexture = this.h.createAttributeTexture(gl);
      const uvsTexture = this.h.createUvsTexture(gl);
      
      const materials = [];
      for (let [handle, count] of this._material.used) {
         materials.push( this._material.depot.getUniforms(handle) );
      }
      
      return {pullVertex, 
              position: {type:"sampler2D", value: positionTexture}, 
              attribute: {type:"sampler2D", value: attrsTexture},
              uvs: {type: "sampler2DArray", value: uvsTexture},
              materials, };
   }

   doneEdit() {
      throw("extended class needs to implment updating internal");
   }

   createAttributeInterpolator() {
      return this._hEdges.createAttributeInterpolator();
   }
   
   get f() {
      return this._faces;
   }
   
   get h() {
      return this._hEdges;
   }
   
   get v() {
      return this._vertices;
   }

   get o() {
      return this._holes;
   }
   
   addNameGroup(name, start) {
      let ret = new NameGroup(name, start);
      this._bin.nameGroup.push( ret );
      return ret;
   }
   
   addVertex(inPt, inOffset=0) {
      // Todo: check free first

      const v = this.v;
      // allocated from both pt and vertex
      const vertex = v.alloc();
      v.setHalfEdge(vertex, -1);
      v.copyPt(vertex, inPt, inOffset);
      return vertex;
   }
   
   addFace(pts, material) {
      return this.addFaceEx(0, pts.length, pts, material);
   }
  
   findHalfEdge(v0, v1) {
      for (let outEdge of this._vertices.outEdgeIter(v0)) {
         if (this._hEdges.destination(outEdge) === v1) {
            return outEdge;
         }
      }
      return -1;
   }
        
   /**
    * search for free gap,
    * @see {@link http://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm}
    * @param {integer} inner_next - next index of gap  
    * @param {integer} inner_prev - prev index of gap
    * @returns {integer} - the gap index, or -1 if not founded.
    */
   findFreeInEdge(inner_next, inner_prev) {
      const hEdges = this.h;
      const startingFrom = hEdges.pair(inner_next);
      const andBefore = inner_prev;
      if (andBefore !== startingFrom) {
         let current = startingFrom;
         do {
            if (hEdges.isBoundary(current)) {
               return [true, current];
            }
            current = hEdges.pair( hEdges.next(current) );
         } while (current !== andBefore);
      }

      console.log("BaseMesh.addFace.findFreeInEdge: patch re-linking failed");
      return [false, 0];
   }


   makeAdjacent(inEdge, outEdge) {
      const hEdges = this.h;
      if (hEdges.next(inEdge) === outEdge) {   // adjacency is already correct.
         return true;
      }

      const b = hEdges.next(inEdge);
      const d = hEdges.prev(outEdge);

      // Find a free incident half edge
      // after 'out' and before 'in'.
      const [freeIn, g] = this.findFreeInEdge(outEdge, inEdge);

      if (!freeIn) {
         console.log("BaseMesh.spliceAjacent: no free inEdge, bad adjacency");
         return false;
      } else if (g === d) {
         hEdges.linkNext(inEdge, outEdge);
         hEdges.linkNext(d, b);
      } else {
         const h = hEdges.next(g);

         hEdges.linkNext(inEdge, outEdge);

         hEdges.linkNext(g, b);

         hEdges.linkNext(d, h);
      }
      return true;
   }  
   
   
   sanityCheck() { 
      const vOk = this.v.sanityCheck();
      const hOk = this.h.sanityCheck();
      const fOk = this.f.sanityCheck();
      const oOk = this.o.sanityCheck();
      return (vOk && hOk && fOk && oOk);
   }
   
   stat() {
      let status = this.v.stat();
      status += this.h.stat();
      status += this.f.stat();
      status += this.o.stat();
      return status;
   }
   
   isEmpty() {
      return (this.v.length() === 0) && (this.f.length() === 0);
   }
};




 

export {
   BaseMesh,
   VertexArray,
   HalfEdgeAttributeArray,
   FaceArray,
   HoleArray,
}

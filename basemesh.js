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
   constructor(attrs, uvs) {
      this._attrs = attrs;
      this._uvs = uvs;
   }

   static _rehydrateInternal(self) {
      let attrs;
      if (self._attrs) {
         attrs = Float16PixelArray.rehydrate(self._attrs);
         let uvs;
         if (self._uvs) {
            uvs = TexCoordPixelArray3D.rehydrate(self._uvs);
            return [attrs, uvs];
         }
      }
      // throw error
      throw("no HalfEdgeAttributeArray internal");
   }

   static _createInternal(size) {
      const attrs = Float16PixelArray.create(HalfEdgeAttrK.sizeOf, 3, size*2);
      const uvs = TexCoordPixelArray3D.create(1, size);
      return [attrs, uvs];
   }

   getDehydrate(obj) {
      // return json that can be used by rehydrate to reconstruct Object after passing through webworker
      obj._attrs = this._attrs.getDehydrate({});
      obj._uvs = this._uvs.getDehydrate({});
      return obj;
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
   //pt: 1,
   // cache, 
   //normal: 3,
   //tangent: 3,
   sizeOf: 1,
}
Object.freeze(VertexK);
const VertexAttrK = {   // float for arithmatic
   valence: 0,
   crease: 1,     // (-1=corner, 3 edge with sharpness), (0=smooth, (0,1) edge with sharpness), (>1 == crease, 2 edge with sharpness))
   sizeOf: 2,
}
Object.freeze(VertexAttrK);


class VertexArray {
   constructor(vertices, pts, hEdges, valenceMax) {
      this._vertices = vertices;
      this._pts = pts;
      this._hEdges = hEdges;
      this._valenceMax = valenceMax;
   }

   static rehydrate(self, hEdges) {
      if (self._vertices && self._pts) {// && self._valenceMax) {
         if (self._vertices.hEdge && self._vertices.attr) {
            const vertices = {
               hEdge: Int32PixelArray.rehydrate(self._vertices.hEdge),
               attr: Float32PixelArray.rehydrate(self._vertices.attr),
            };
            const pts = Float32PixelArray.rehydrate(self._pts);
            return new VertexArray(vertices, pts, hEdges, self._valenceMax);
         }
      }
      throw("VertexArray rehydrate: bad input");
   }

   static create(hEdges, size) {
      const vertices = {
         hEdge: Int32PixelArray.create(VertexK.sizeOf, 1, size),
         attr: Float32PixelArray.create(VertexAttrK.sizeOf, 2, size),
      };
      const pts = Float32PixelArray.create(PointK.sizeOf, 3, size);

      return new VertexArray(vertices, pts, hEdges, 0);
   }

   getDehydrate(obj) {
      obj._vertices = {};
      obj._vertices.hEdge = this._vertices.hEdge.getDehydrate({});
      obj._vertices.attr = this._vertices.attr.getDehydrate({});

      obj._pts = this._pts.getDehydrate({});
      obj._valenceMax = this._valenceMax;

      // this._hEdges should be assigned in rehydrate.
      return obj;
   }

   
   *[Symbol.iterator] () {
      yield* this.rangeIter(0, this._vertices.hEdge.length());
   }

   * rangeIter(start, stop) {
      stop = Math.min(this._vertices.hEdge.length(), stop);
      for (let i = start; i < stop; ++i) {
         if (!this.isFree(i)) {
            yield i;
         }
      }
   }
   
   * outEdgeIter(vert) {
      const hEdges = this._hEdges;
   
      const start = this._vertices.hEdge.get(vert, VertexK.hEdge);
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
   
      const start = this._vertices.hEdge.get(vert, VertexK.hEdge);
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
      return this._vertices.attr.get(vertex, VertexAttrK.valence);
   }
   
   setValence(vertex, valence) {
      this._vertices.attr.set(vertex, VertexAttrK.valence, valence);
   }

   crease(vertex) {
      return this._vertices.attr.get(vertex, VertexAttrK.crease);
   }


   setCrease(vertex, crease) {
      this._vertices.attr.set(vertex, VertexAttrK.crease, crease);
   }

   computeValence() {
      let valenceMax = 0;
      for (let i of this) {
         const start = this._vertices.hEdge. get(i, VertexK.hEdge);
         if (start >= 0) {
            let count = 0;
            let current = start;
            let sharpness = 0;
            let creaseCount = 0;
            do {
               if (creaseCount < 3) {
                  let value = this._hEdges.sharpness(current);
                  if (value > 0) {
                     if (sharpness !== 0) {  // get minimum excluding zero
                        sharpness = Math.min(sharpness, value);
                     } else {
                        sharpness = value;
                     }
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
            this.setValence(i, count);
            if (creaseCount > 2) {
               this.setCrease(i, -1);
            } else if (creaseCount === 2) {
               this.setCrease(i, sharpness);
            } else {
               this.setCrease(i, 0);
            }

         }
      }
      this._valenceMax = valenceMax;
   }

   alloc() {
      this._vertices.attr.alloc();
      const vertex = this._vertices.hEdge.alloc();
      this._pts.alloc();
      return vertex;
   }
   
   _allocEx(size) {
      const start = this.length();
      this._vertices.attr.allocEx(size);
      this._vertices.hEdge.allocEx(size);
      this._pts.allocEx(size);
   }

   isFree(vert) {
      return (this._vertices.hEdge.get(vert, VertexK.hEdge) < 0);
   }

   copyPt(vertex, inPt, inOffset) {
      vec3.copy(this._pts.getBuffer(), vertex * PointK.sizeOf, inPt, inOffset);
   }
   
   halfEdge(vert) {
      return this._vertices.hEdge.get(vert, VertexK.hEdge);
   }
   
   setHalfEdge(vert, hEdge) {
      this._vertices.hEdge.set(vert, VertexK.hEdge, hEdge);
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
      return "Vertices Count: " + this._vertices.hEdge.length() + ";\n";
   }
   
   length() {
      return this._vertices.hEdge.length();
   }
   
   lengthPt() {
      return this._pts.length();
   }
}



class FaceArray {
   constructor(materialDepot, normals) {
      this._normals = normals;
      this._depot = materialDepot;
   }

   static _rehydrateInternal(self) {
      if (self._normals) {
         return [Float32PixelArray.rehydrate(self._normals)];
      }
      //throw("FaceArray _rehydrateInternal: bad input");
   }

   static _createInternal(depot, size) {
      return [depot, Float32PixelArray.create(3, 3, size)];
   }

   getDehydrate(obj) {
      obj._normals = null;
      if (this._normals) {
         obj._normals = this._normals.getDehydrate({});
      }
      return obj;
   }
   
   *[Symbol.iterator] () {
      yield* this.rangeIter(0, this.length());
   }

   * rangeIter(start, stop) {
      stop = Math.min(this.length(), stop);
      for (let i = start; i < stop; ++i) {
         yield i;
      }
   }
      
   alloc(material) {
      const handle = this._allocEx(1);
      if (material == null) {
         material = this._depot.getDefault();
      }
      this.setMaterial(handle, material);
      this._depot.addRef(material, 1);
      return handle;
   }
      
   _materialAddRef(material, count) {
      this._depot.addRef(material, count);
   }

   setMaterial(polygon, material) {
      let oldMaterial = this.material(polygon);
      if (oldMaterial !== material) {
         this._setMaterial(polygon, material);
         this._depot.releaseRef(oldMaterial, 1);
         this._depot.addRef(material, 1);
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
   constructor(hEdges, holes) {
      this._hEdges = hEdges;
      this._holes = holes;
   }

   static _rehydrateInternal(self) {
      if (self._holes) {
         return [Int32PixelArray.rehydrate(self._holes)];
      }
      throw("HoleArray _rehydrateInternal: bad input");
   }

   static _createInternal() {
      const holes = Int32PixelArray.create(1, 1);
      // zeroth is freeCount, 1st element is free head list, real hole start from 2nd element.
      // this._holes.set(1, 0, -1);
      holes.allocEx(2);  // preallocated [size, freeHead] if any
      return [holes];
   }

   getDehydrate(obj) {
      obj._holes = this._holes.getDehydrate({});
      return obj;
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
      const hEdges = this._hEdges;
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
      const hEdges = this._hEdges;
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
   constructor(bin, material) {
      this._bin = bin;
      this._material = material;
   }

   static _rehydrateInternal(self) {
      // nothing, we are only interested in geometry data.
      return [null, null];
   }

   static _createInternal(materialDepot) {
      const bin = {nameGroup:[], };

      const material = {depot: materialDepot};
      const warehouse = new Map
      material.used = warehouse;
      material.proxy = {                    // TODO: use real proxy?
         *[Symbol.iterator] () {
            yield* warehouse;
         },

         addRef: (material, count)=> {
            materialDepot.addRef(material, count);
            let oldCount = warehouse.get(material);
            if (oldCount === undefined) {
               oldCount = 0;
            }
            warehouse.set(material, oldCount + count);
         },

         releaseRef: (material, count)=> {
            materialDepot.releaseRef(material, count);
            let oldCount = warehouse.get(material);
            count = oldCount - count;
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

      return [bin, material];
   }

   getDehydrate(obj) {
      // get nothing because subdivide don't use it.
      return obj;
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

   get m() {
      return this._material.proxy;
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

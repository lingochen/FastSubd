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
   boundary: 3,
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
         // if (!isFree(i)) {
         yield i;
         // }
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
      let boundary = false;
      for (let i = 0; i < this._vertices.length(); ++i) {
         const start = this._vertices.get(i, VertexK.hEdge);
         if (start >= 0) {
            let count = 0;
            let current = start;
            do {
               boundary = boundary || this._hEdges.isBoundary(current);
               const pair = this._hEdges.pair(current);
               current = this._hEdges.next( pair );
               count++;
            } while (current !== start);
            if (count > valenceMax) {
               valenceMax = count;
            }
            this._vertices.set(i, VertexK.valence, count);
            this._vertices.set(i, VertexK.boundary, boundary);
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

   copyPt(vertex, inPt, inOffset) {
      const pt = this._vertices.get(vertex, VertexK.pt);
      vec3.copy(this._pts.getBuffer(), pt * PointK.sizeOf, inPt, inOffset);
   }
   
   pt(vert) {
      return this._vertices.get(vert, VertexK.pt);
   }
   
      
   valence(vert) {
      return this._vertices.get(vert, VertexK.valence);
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
      this._hEdges.computeNormal(this._vertices);
      
      const pullVertex = this._faces.makePullBuffer(this._vertices);
   
      const positionTexture = this._vertices.createPositionTexture(gl);
      const attrsTexture = this._hEdges.createAttributeTexture(gl);
      const uvsTexture = this._hEdges.createUvsTexture(gl);
      
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

   computeValence() {
      this.v.computeValence();
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
   
   addNameGroup(name, start) {
      let ret = new NameGroup(name, start);
      this._bin.nameGroup.push( ret );
      return ret;
   }
   
   addVertex(inPt, inOffset=0) {
      // Todo: check free first

      // allocated from both pt and vertex
      const vertex = this._vertices.alloc();
      this._vertices.setHalfEdge(vertex, -1);
      this._vertices.copyPt(vertex, inPt, inOffset);
      return vertex;
   }
   
   addFace(pts, material) {
      return this.addFaceEx(0, pts.length, pts, material);
   }
   
        
   /**
    * search for free gap,
    * @see {@link http://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm}
    * @param {integer} inner_next - next index of gap  
    * @param {integer} inner_prev - prev index of gap
    * @returns {integer} - the gap index, or -1 if not founded.
    */
   findFreeInEdge(inner_next, inner_prev) {
      const hEdges = this._hEdges;
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


   spliceAdjacent(inEdge, outEdge) {
      const hEdges = this._hEdges;
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
      const vOk = this._vertices.sanityCheck();
      const hOk = this._hEdges.sanityCheck();
      const fOk = this._faces.sanityCheck();
      return (vOk && hOk && fOk);
   }
   
   stat() {
      let status = this._vertices.stat();
      status += this._hEdges.stat();
      return (status + this._faces.stat());
   }
   
   isEmpty() {
      return (this._vertices.length() === 0) && (this._faces.length() === 0);
   }
};




 

export {
   BaseMesh,
   VertexArray,
   HalfEdgeAttributeArray,
   FaceArray,
}

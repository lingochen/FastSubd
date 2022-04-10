/**
 * subdivision functions
 *
 */
import {PolyMesh, PolygonK, HalfEdgeK} from './polymesh.js';
import {TriMesh, DirectedEdgeArray} from './trimesh.js';
import {vec3, vec3a} from "./vec3.js";


/**
 * Catmull-Clark subdivision function
 * 
 * @param {PolyMesh} source - source of subdivision
 * @returns {PolyMesh} return a new catmull-clark subdivide polymesh.
 */
const subdivideCC = (()=>{
   // 
   // each wEdge subdivide to 4 wEdge. 
   // Pro: simple indexing
   // Con: wasted hEdges on Boundary Edge.
   //
   // each face subdivide to the number of edges. ie 5 edges face to 5 quad.
   // each wedge is subdivide to 4 wedge.
   //                           A     6 || 7         B
   //        1                          || 
   //     ----->      subdivide     5---->--->1
   //     <-----        ->          4<---<----0
   //        0                          || 
   //                           B     3 || 2         A
   //   
   
   /**
      add middle of face point.
      note: we could also subdivide and link here, but currently no.
   */
   function refineFace(subd, source) {    
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();   
      const attr = source.createAttributeInterpolator();
      
      let offset = source.v.lengthPt();
      for (let face of source.f) {
         attr.reset();
         let count = 0;
         let i = (offset+face) * 3;          // *3 because a pt is (xyz) size of 3.
         for (let hEdge of source.f.halfEdgeIter(face)) {
            vec3a.add(dest, i, src, source.h.position(hEdge)*3); 
            attr.add(hEdge);
            ++count;
         }
         let divisor = 1.0/ count;
         vec3a.scale(dest, i, divisor);
         attr.interpolate(divisor);
         // point to first halfEdge's expansion.
         const hEdge = source.f.halfEdge(face);
         subd.v.setHalfEdge(offset+face, hEdge * 4 + 3);
         
         // copy attributes, and (not subdivide face?)
         for (let hEdge of source.f.halfEdgeIter(face)) {
            attr.copyTo(subd, hEdge * 4 + 3);            
         }
      };
   };

   /**
      add point to the middle of edge
   */
   function refineEdge(subd, source) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
   
      const midEdge = [0.0, 0.0, 0.0];
      const smoothMid = [0.0, 0.0, 0.0];
      const attr = source.createAttributeInterpolator();

      let offsetFace = source.v.lengthPt();
      let offset =  offsetFace + source.f.length();
      for (let [wEdge, left, right] of source.h) {
         let count = 2;
         
         vec3.add(midEdge, 0, src, source.h.position(left)*3, src, source.h.position(right)*3);
         smoothMid[0]=smoothMid[1]=smoothMid[2]=0.0;
         let face = source.h.face(left);
         if (!PolygonK.isHole(face)) {
            count++;
            vec3a.add(smoothMid, 0, dest, (offsetFace+face)*3);
         }
         face = source.h.face(right);
         if (!PolygonK.isHole(face)) {
            count++;
            vec3a.add(smoothMid, 0, dest, (offsetFace+face)*3);
         }
         vec3a.add(smoothMid, 0, midEdge, 0);
         vec3a.scale(midEdge, 0, 0.5);
         vec3a.scale(smoothMid, 0, 1.0/count); 
         // write result,
         const edgeWeight = (count === 4) ? 1.0 : 0.0;  // check for boundary condition?
         vec3.lerp(dest, (offset + wEdge) * 3, 
                   midEdge, 0, smoothMid, 0, 
                   edgeWeight);
         // v'halfEdge point to newly expanded wEdge's halfEdge 
         subd.v.setHalfEdge(offset+wEdge, left*4 + 2); 
         
         // copy left(even) and right(odd) attribute, and compute new one.
         attr.init(left);
         attr.copyTo(subd, left * 4);           // copy original
         attr.add(source.h.next(left));
         attr.interpolate(0.5);
         attr.copyTo(subd, left * 4 + 4);
         attr.copyTo(subd, left * 4 + 2);
         // right hEdge
         attr.init(right);
         attr.copyTo(subd, right * 4 + 1);       // copy original
         attr.add(source.h.next(right));
         attr.interpolate(0.5);
         attr.copyTo(subd, left * 4 + 1);
         attr.copyTo(subd, right * 4 + 2);
      }
   }
   
   /**
      push down the vertex point.
   */
   function refineVertex(subd, source) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();

      const smoothPt = [0, 0, 0];
   
      let offsetFace = source.v.lengthPt();
      let offsetEdge = offsetFace + source.f.length();
      for (let vertex of source.v) {
         smoothPt[0] = smoothPt[1]= smoothPt[2] = 0.0;
         let valence = 0;
         for (let hEdge of source.v.outEdgeIter(vertex)) {
            let face = source.h.face(hEdge);
            if (!PolygonK.isHole(face)) {  // TODO: reconsider how to add empty face
               vec3a.scaleAndAdd(smoothPt, 0, dest, (offsetFace+face)*3, -1.0);
            }
            vec3a.scaleAndAdd(smoothPt, 0, dest, (offsetEdge+source.h.wEdge(hEdge))*3, 4.0);
            ++valence;
         }
         // write out average point result
         vec3a.scale(smoothPt, 0, 1.0 / (valence*valence));
         vec3.scaleAndAdd(dest, vertex*3, 
                           smoothPt, 0, 
                           src, vertex*3,
                           1.0 - 3.0 / valence);
         // readjust to expand halfEdge
         let hEdge = source.v.halfEdge(vertex);
         subd.v.setHalfEdge(vertex, hEdge * 4 + (HalfEdgeK.isOdd(hEdge)? 1 : 0));
      }
   }

   // 
   // each wEdge subdivide to 4 wEdge. 
   // Pro: simple indexing
   // Con: wasted hEdges on Boundary Edge.
   //
   // each face subdivide to the number of edges. ie 5 edges face to 5 quad.
   // each wedge is subdivide to 4 wedge.
   //                           A     6 || 7         B
   //        1                          || 
   //     ----->      subdivide     5---->--->1
   //     <-----        ->          4<---<----0
   //        0                          || 
   //                           B     3 || 2         A
   //
   function subdivideFace(subd, source) {  // pointing to the 
      const computeIndices = (partA, partB, hEdge)=> {
         const isOdd = HalfEdgeK.isOdd(hEdge);
         const wEdge = HalfEdgeK.wEdge(hEdge);
         const base = wEdge*8; // every wedge is expand by 4 wedges (2*halfEdge)
         if (isOdd) {   // (5(2),6(3),7(3),1(0)),
            partA[0] = base + 5;
            partA[1] = base + 6;
            partB[0] = base + 7;
            partB[1] = base + 1;
         } else {       // (0(0), 2(1), 3(1), 4(2)),
            partA[0] = base;
            partA[1] = base + 2;
            partB[0] = base + 3;
            partB[1] = base + 4;
         }
         return wEdge;
      }
      const linkQuad = (subd, prevB, partA, faceId, material)=>{ // linkNext quadFace
         // connect the inner quad
         subd.h.linkNext(prevB[0], prevB[1]);
         subd.h.setFace(prevB[0], faceId);
         subd.h.linkNext(prevB[1], partA[0]);
         subd.h.setFace(prevB[1], faceId);
         subd.h.linkNext(partA[0], partA[1]);
         subd.h.setFace(partA[0], faceId);
         subd.h.linkNext(partA[1], prevB[0]);
         subd.h.setFace(partA[1], faceId);
         // face just point to any halfEdge
         subd.f.setHalfEdge(faceId, prevB[0]);
         subd.f._setMaterial(faceId, material);
      }
      
      // tail link to head, so we have to save headA first.
      let faceId = 0;
      const idx = [[-1, -1], [-1, -1], [-1, -1]];
      const headA = [-1, -1];
      for (let face of source.f) {
         let material = source.f.material(face);
         let count = 0;
         let i = 0;
         let prevB=-1, partA=headA, partB=idx[0];
         for (let hEdge of source.f.halfEdgeIter(face)) { // each hEdge becomes 
            ++count;
            const wEdge = computeIndices(partA, partB, hEdge);
            // update vertex(pt?), (origin, wEdgeId, faceEdgeId, wEdgeId)
            subd.h.setOrigin(partA[0],  source.h.origin(hEdge));
            subd.h.setOrigin(partA[1], source.v.lengthPt() + source.f.length() + wEdge);
            subd.h.setOrigin(partB[0], source.v.lengthPt() + face);
            subd.h.setOrigin(partB[1], source.v.lengthPt() + source.f.length() + wEdge);
            // quad face update.
            if (prevB !== -1) {   // now we can do the quad linking
               linkQuad(subd, prevB, partA, faceId++, material);
            }
            // rotate through the index
            prevB = partB;
            i = ++i % 3;
            partA = idx[i];
            i = ++i % 3;
            partB = idx[i];
         }
         // do the first quad face, and add material reference
         linkQuad(subd, prevB, headA, faceId++, material);
         subd.f._materialAddRef(material, count);
      }
   }
   
   function subdivideHole(subd, source) {
   
   }
   
   function nextFaceLength(source) {
      let count = 0;
      for (let face of source.f) {
         count += source.f.halfEdgeCount(face);
      }
      return count;
   }

   /**
    * Catmull-Clark subdividing functions.
    * @param {PolyMesh} source - original PolyMesh to be subdivide 
    * @returns {PolyMesh} the Catmull-Clark subdivided Polymesh
   */
   return function(source) {
      const subd = new PolyMesh(source._material.depot);
      
      // preallocated enough points to next subdivision level, 
      subd.v._allocEx(source.v.lengthPt() + source.f.length() + source.h.lengthW());
      // preallocated next level of the wEdges/Faces.
      subd.h._allocEx(source.h.length()*2);   // *4, but hEdge already *2.
      subd.f._allocEx(nextFaceLength(source));

      // build/refine all points.
      refineFace(subd, source);
      refineEdge(subd, source);
      refineVertex(subd, source);
      
      // fixed-up the wEdges, Faces, and vertex connection.
      subdivideFace(subd, source);
      subdivideHole(subd, source);
      
      return subd;
   }
})();



const subdivideTriPoly = (source, refineEdge, refineVertex)=>{
   // 
   // each wEdge subdivide to 4 wEdge. 
   // Pro: simple indexing
   // Con: wasted hEdges on Boundary Edge.
   //
   // each face subdivide to the number of edges. ie 5 edges face to 5 quad.
   // each wedge is subdivide to 4 wedge.
   //                           A     6 || 7         B
   //        1                          || 
   //     ----->      subdivide     5---->--->1
   //     <-----        ->          4<---<----0
   //        0                          || 
   //                           B     3 || 2         A
   //
   function subdivideFace(subd, source) {
      const computeIndices = (part, hEdge)=> {
         const isOdd = HalfEdgeK.isOdd(hEdge);
         const wEdge = HalfEdgeK.wEdge(hEdge);
         const base = wEdge*8; // every wedge is expand by 4 wedges (2*halfEdge)
         if (isOdd) {   // (5(2),6(3),7(3),1(0)),
            part[0] = base + 5;
            part[1] = base + 6;
            part[2] = base + 7;
            part[3] = base + 1;
         } else {       // (0(0), 2(1), 3(1), 4(2)),
            part[0] = base;
            part[1] = base + 2;
            part[2] = base + 3;
            part[3] = base + 4;
         }
         return wEdge;
      }
      const linkTri = (subd, hEdge0, hEdge1, hEdge2, faceId, material)=>{ // linkNext triFace
         subd.h.linkNext(hEdge0, hEdge1);
         subd.h.setFace(hEdge0, faceId);
         subd.h.linkNext(hEdge1, hEdge2);
         subd.h.setFace(hEdge1, faceId);
         subd.h.linkNext(hEdge2, hEdge0);
         subd.h.setFace(hEdge2, faceId);
         // face just point to any halfEdge
         subd.f.setHalfEdge(faceId, hEdge0);
         subd.f._setMaterial(faceId, material);       
      }

      let faceId = 0;
      // cut corners, since we guaranteed to be triangle, we can compute the 3 edges directly
      const expand = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
      const edgesMid = [-1, -1, -1]; 
      for (let face of source.f) {
         let material = source.f.material(face);
         let count = 0;
         for (let hEdge of source.f.halfEdgeIter(face)) { // each hEdge becomes 4 hEdges.
            if (count >= 3) {
               throw("not a triangle in a triangle polymesh, faceID:" + face);
            }
            let part = expand[count];
            const wEdge = computeIndices(part, hEdge);
            // update vertex(pt?), (origin, wEdgeId, faceEdgeId, wEdgeId), cut corner triangle.
            subd.h.setOrigin(part[0],  source.h.origin(hEdge));
            let mid = source.v.lengthPt() + wEdge;
            subd.h.setOrigin(part[1], mid);
            //subd.h.setOrigin(part[2], source.v.lengthPt() + face);
            subd.h.setOrigin(part[3], mid);
            edgesMid[count] = mid;
            count++;
         }
         // fix the corner edges.
         subd.h.setOrigin(expand[0][2], edgesMid[2]);
         subd.h.setOrigin(expand[1][2], edgesMid[0]);
         subd.h.setOrigin(expand[2][2], edgesMid[1]);
         // now link the 4 triangles, 
         linkTri(subd, expand[0][0], expand[0][1], expand[2][3], faceId++, material);
         linkTri(subd, expand[1][0], expand[1][1], expand[0][3], faceId++, material);
         linkTri(subd, expand[2][0], expand[2][1], expand[1][3], faceId++, material);
         linkTri(subd, expand[0][2], expand[1][2], expand[2][2], faceId++, material);
         subd.f._materialAddRef(material, 4);
      }
   }
   
   function computeSubdivideMid(hEdge) {
      return hEdge*4 + 2;
   }

   function computeSubdividehEdge(hEdge) {
      return hEdge * 4 + (HalfEdgeK.isOdd(hEdge)? 1 : 0);
   }
   
   const subd = new PolyMesh(source._material.depot);
   subd.v._valenceMax = source.v.valenceMax();
   
   // preallocated enough points to next subdivision level, 
   subd.v._allocEx(source.v.length() + source.h.lengthW());
   // preallocated next level of the wEdges/Faces.
   subd.h._allocEx(source.h.length()*2);   // *4, but hEdge already *2.
   subd.f._allocEx(source.f.length() * 4);

   // add/refine middle edge points.
   refineEdge(subd, source, computeSubdivideMid);
   // copy and setup vertex's hEdge
   refineVertex(subd, source, computeSubdividehEdge);
   
   // fixed-up the wEdges, Faces, and vertex connection.
   subdivideFace(subd, source);
   // subdivideHole(subd, source);
   
   return subd;
};




const subdivideTri = (source, refineEdge, refineVertex)=>{
   /**
    each face divide to 4 face, wEdge*3, 
   */  
   function subdivideFace(subd, source) {
      function computeWEdgeAndPair(wEdge, hEdge) {
         const pair = srcH.pair(hEdge);
         const [face, index] = DirectedEdgeArray.faceAndIndex(pair);
         const i = (srcH.wEdgeLeft(srcH.wEdge(hEdge)) === hEdge) ? 1 : 0;
         return [wEdge*2+i, face*3*4 + ((index*3+5)%9)];
      }
      function computeWEdgeAndPairEnd(wEdge, hEdge) {
         const pair = srcH.pair(hEdge);
         const [face, index] = DirectedEdgeArray.faceAndIndex(pair);
         const i = (srcH.wEdgeLeft(srcH.wEdge(hEdge)) === hEdge) ? 0 : 1;
         return [wEdge*2+i, face*3*4 + index*3];
      }
      const srcH = source.h;
      const subdH = subd.h;
      const subdF = subd.f;
   
      const wEdgeOffset = srcH.lengthW() * 2;        // original wEdge expand by *2
      const offset = source.v.length();
      for (let face of source.f) {
         let material = source.f.material(face);
         // 1 grow to 4.
         let srcEdge = face * 3;
         let destEdge = srcEdge * 4;
         let destFace = face * 4;
         
         // 3 edges to 3 faces, setOrigin, setPair, setWEdge, and setup extra face in the middle
         let wEdge = [srcH.wEdge(srcEdge),
                      srcH.wEdge(srcEdge+1),
                      srcH.wEdge(srcEdge+2) ];
         for (let i = 0; i < 3; ++i) {
            let j = (i+2)%3;
            let [newWEdge, newPair] = computeWEdgeAndPair(wEdge[i], srcEdge+i);
            subdH.setOrigin(destEdge, srcH.origin(srcEdge+i));
            subdH._setPair(destEdge, newPair);
            subdH.setWEdge(destEdge, newWEdge);
   
            subdH.setOrigin(destEdge+1, offset+wEdge[i]);
            newPair = destEdge+9 - i*2;                  // mid pair
            subdH.setOrigin(newPair, offset+wEdge[j]);  // middle extra face
            subdH.setPair(destEdge+1, newPair);
            newWEdge = wEdgeOffset+face*3+i;             
            subdH.setWEdge(destEdge+1, newWEdge);
            subdH.setWEdge(newPair, newWEdge);           // middle extra face

            [newWEdge, newPair] = computeWEdgeAndPairEnd(wEdge[j], srcEdge+j);
            subdH.setOrigin(destEdge+2, offset+wEdge[j]);
            subdH._setPair(destEdge+2, newPair);
            subdH.setWEdge(destEdge+2, newWEdge);
         
            subdF._setMaterial(destFace+i, material);
         
            // prepare next face
            destEdge += 3;
         }
         // middle and last face
         subdF._setMaterial(destFace+3, material);

         subdF._materialAddRef(material, 4);
      }
   
   }
   
   function computeSubdivideMid(hEdge) {
      const [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
      return face*3*4 + index*3+1;  
   }
   
   function computeSubdividehEdge(hEdge) {
      const [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
      return (face*3*4) + (index*3);
   }
   
   const subd = new TriMesh(source._material.depot);
   subd.v._valenceMax = source.v.valenceMax();
   
   // preallocated enough points to next subdivision level, 
   subd.v._allocEx(source.v.length() + source.h.lengthW());
   // preallocated next level of the wEdges/Faces.
   subd.h._allocEx(source.f.length() * 4);   // directedEdge mapped to face 3:1
   subd.h._allocWEdge(source.h.lengthW()*2 + source.f.length()*3);
   subd.f._allocEx(source.f.length() * 4);

   // add/refine middle edge points.
   refineEdge(subd, source, computeSubdivideMid);
   // copy and setup vertex's hEdge
   refineVertex(subd, source, computeSubdividehEdge);
   
   // fixed-up the wEdges, Faces, and vertex connection.
   subdivideFace(subd, source);
   // subdivideHole(subd, source);
   
   return subd;
};



/**
   modified butterfly coeficcient from Prof. Zorin
   http://www.multires.caltech.edu/pubs/interpolationTR.pdf
  
   more approacheable article by Brian Sharp 
   https://www.gamasutra.com/view/feature/3177/subdivision_surface_theory.php?print=1
  
   (origin vertex using 3/4 coefficient)
 */
const mbCoeffK = [[],[], [],
                  [5/12, -1/12, -1/12, 3/4],
                  [3/8, 0, -1/8, 0, 3/4]];

function computeButterflyCoefficient(valence) {
   // assume valence >= 3.
   if (valence < 3) {
      console.log("impossible vertex valence");
      return;
   }

   if (mbCoeffK.length <= valence) {   // guarantee to have array
      for (let val = mbCoeffK.length; val <= valence; ++val) {
         let coeff = [];
         mbCoeffK.push( coeff );
         let sum = 0;
         for (let j = 0; j < val; ++j) {
            const invVal = 1 / val;
            let temp = (2 * Math.PI * j) * invVal;
            let value = 0.25 + Math.cos( temp ) + 0.5 * Math.cos(2*temp);
            value *= invVal;
            coeff.push( value );
            sum += value;
         }
         coeff.push( 1.0 - sum );
      }
   } 
}
/**
 Modified Butterfly subdivision scheme, according 
*/
const subdivideMB = (()=> {
   // for the normal wEdge 6-valence.
   const wK = -1/16;          // wK is arbitray small value, can be 0.
   const aK = 1/2 - wK;
   const bK = 1/8 + 2*wK;
   const cK = -1/16 - wK;
   const dK = wK;
   const stencil = [bK, cK, dK, cK];
 
   function refineEdge(subd, source, computeSubdivideMid) {
      function computeExtraodinary(midEdge, current, coeff) {
         // iterated through the extradinary vertex
         let i = 0;
         let inEdge;
         const end = current;
         do {
            inEdge = hEdges.pair(current);
            vec3a.scaleAndAdd(midEdge, 0, src, hEdges.origin(inEdge)*3, coeff[i++]);
            current = hEdges.next( inEdge );
         } while (current !== end);
      }
   
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
      const hEdges = source.h;
      
      const midEdge = [0.0, 0.0, 0.0];
      const attr = source.createAttributeInterpolator();

      let offset = source.v.lengthPt();
      for (let [wEdge, left, right] of hEdges) {
         const leftV = hEdges.origin(left);
         const valLeft = source.v.valence( leftV );
         const rightV = hEdges.origin(right);
         const valRight = source.v.valence( rightV );
         const val0 = valLeft === 6;
         const val1 = valRight === 6;
         
         if (val0 && val1) {  // case 1, 10-point stencil
            vec3.scale(midEdge, 0, src, hEdges.position(left)*3, aK);
            
            for (let [lt, rt] of [[left,right],[right,left]]) {
               let i = 0;
               let inEdge;
               let end = hEdges.pair(hEdges.prev(lt));
               let current = hEdges.next( rt );
               do {
                  inEdge = hEdges.pair(current);
                  vec3a.scaleAndAdd(midEdge, 0, src, hEdges.origin(inEdge)*3, stencil[i++]);
                  current = hEdges.next( inEdge );
               } while (current !== end);
            }
            
            vec3a.scaleAndAdd(midEdge, 0, src, hEdges.position(right)*3, aK);
         } else if (!val0 && !val1) {   // case 3, average of both extraodinary vertices
            vec3.scale(midEdge, 0, src, hEdges.position(left)*3, mbCoeffK[valLeft][valLeft]);
            vec3a.scaleAndAdd(midEdge, 0, src, hEdges.position(right)*3, mbCoeffK[valRight][valRight]);
            computeExtraodinary(midEdge, left,  mbCoeffK[valLeft]);
            computeExtraodinary(midEdge, right,  mbCoeffK[valRight]);
            vec3a.scale(midEdge, 0, 1/2);
         } else { // case 2, use the lone extraodinary vertex
            let v = leftV;
            let val = valLeft;
            let hEdge = left;
            let coeff = mbCoeffK[valLeft];
            if (val0) {
               v = rightV;
               val = valRight;
               hEdge = right;
               coeff = mbCoeffK[valRight];
            } 
            vec3.scale(midEdge, 0, src, hEdges.position(hEdge)*3, coeff[val]);
            computeExtraodinary(midEdge, hEdge, coeff);
         } // TODO: boundary edge.
         
         // copy over
         vec3.copy(dest, (offset + wEdge) * 3, midEdge, 0); 
         // and setup outEdge pointer
         subd.v.setHalfEdge(offset+wEdge, computeSubdivideMid(left));
         subd.v.setValence(offset+wEdge, 6);                         // newly create valence is always 6, unless opposite side is boundary.
         
         // copy left(even) and right(odd) attribute, and compute new one.
         const aTable = [5, 8, 2];
         const bTable = [10, 11, 9];
         for (let hEdge of [left, right]) {
            let [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
            attr.init(hEdge);
            face = face*3*4;
            let indexE = index * 3;
            attr.copyTo(subd, face + indexE);       // copy original
            attr.add(hEdges.next(hEdge));
            attr.interpolate(0.5);
            attr.copyTo(subd, face+indexE+1);
            attr.copyTo(subd, face+aTable[index]);
            attr.copyTo(subd, face+bTable[index] );
         }
      }
   }

   function refineVertex(subd, source, computeSubdividehEdge) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();

      // copy over and setup hEdge pointer
      for (let vertex of source.v) {
         vec3.copy(dest, vertex*3, src, vertex*3);

         const hEdge = source.v.halfEdge(vertex);
         subd.v.setHalfEdge(vertex, computeSubdividehEdge(hEdge));
         subd.v.setValence(vertex, source.v.valence(vertex));    // valence is the same for original vertex
      }
   }
 

   return function(source) {
      computeButterflyCoefficient(source.v.valenceMax());
      if (source instanceof TriMesh) {
         return subdivideTri(source, refineEdge, refineVertex);
      } else {
         return subdivideTriPoly(source, refineEdge, refineVertex);
      }
   }

})();


const subdivideLoop = (()=>{

   function refineEdge(subd, source, computeSubdivideMid) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
      const destV = subd.v;
      const hEdges = source.h;
      
      const midEdge = [0.0, 0.0, 0.0];
      const attr = source.createAttributeInterpolator();

      let offset = source.v.lengthPt();
      for (let [wEdge, left, right] of hEdges) {
         // compute mid-Edge
         const leftV = hEdges.origin(left);
         const rightV = hEdges.origin(right);
         const leftV1 = hEdges.origin( hEdges.prev(left) );
         const rightV1 = hEdges.origin( hEdges.prev(right) );
         
         vec3.scale(midEdge, 0, src, leftV*3, 3/8);
         vec3a.scaleAndAdd(midEdge, 0, src, rightV*3, 3/8);
         vec3a.scaleAndAdd(midEdge, 0, src, leftV1*3, 1/8);
         vec3a.scaleAndAdd(midEdge, 0, src, rightV1*3, 1/8);
         
         // copy over
         vec3.copy(dest, (offset + wEdge) * 3, midEdge, 0); 
         // and setup outEdge pointer
         destV.setHalfEdge(offset+wEdge, computeSubdivideMid(left));
         destV.setValence(offset+wEdge, 6);                         // newly create valence is always 6, unless opposite side is boundary.

         
         // copy left(even) and right(odd) attribute, and compute new one.
         const aTable = [5, 8, 2];
         const bTable = [10, 11, 9];
         for (let hEdge of [left, right]) {
            let [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
            attr.init(hEdge);
            face = face*3*4;
            let indexE = index * 3;
            attr.copyTo(subd, face + indexE);       // copy original
            attr.add(hEdges.next(hEdge));
            attr.interpolate(0.5);
            attr.copyTo(subd, face+indexE+1);
            attr.copyTo(subd, face+aTable[index]);
            attr.copyTo(subd, face+bTable[index] );
         }
      }
   }
   
   function refineVertex(subd, source, computeSubdividehEdge) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
      const srchEdges = source.h;
      const srcV = source.v;

      const pt = [0, 0, 0];
      // copy over and setup hEdge pointer
      for (let vertex of source.v) {
         // compute push down
         
         let beta = 3/16;
         const k = source.v.valence(vertex);
         if (k > 3) {
            beta = 3 / (8*k);
         }
         vec3.scale(pt, 0, src, vertex*3, 1 - k*beta);
         for (let inEdge of source.v.inEdgeIter(vertex)) {
            let out = srchEdges.origin(inEdge);
            vec3a.scaleAndAdd(pt, 0, src, out*3, beta);
         }
         
         vec3.copy(dest, vertex*3, pt, 0);

         const hEdge = srcV.halfEdge(vertex);
         subd.v.setHalfEdge(vertex, computeSubdividehEdge(hEdge));
         subd.v.setValence(vertex, srcV.valence(vertex));         // valence of the original vertex don't change
      }
   }
   
   return function(source) {
         if (source instanceof TriMesh) {
            return subdivideTri(source, refineEdge, refineVertex);
         } else {
            return subdivideTriPoly(source, refineEdge, refineVertex);
         }
      }
})();


export {
   subdivideCC,
   subdivideLoop,
   subdivideMB,
}

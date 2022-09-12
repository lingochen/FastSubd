/**
 * webworker'
 *
 */

import {TriMesh, DirectedEdgeArray, fEdgeK} from "../trimesh.js";
import {vec3, vec3a} from "../vec3.js";


const gObj = {
   source: null,
   subd: null,
   id: -1,
};


const init = {
   loop: function(data) {
      // rehydrate
      gObj.source = TriMesh.rehydrate(data.source);
      gObj.subd = TriMesh.rehydrate(data.subd);
      gObj.id = data.id;
      // gHandler
      gHandler = loop;
   },


}


const triMesh = {
   computeSubdivideMid: function(hEdge) {
      const [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
      return face*3*4 + index*3+1;
   },

   computeSubdividehEdge: function(hEdge) {
      const [face, index] = DirectedEdgeArray.faceAndIndex(hEdge);
      return (face*3*4) + (index*3);
   },
};

const loop = {
   /**
    * @param {*} subd
    * @param {*} source
    * @param {*} computeSubdivideMid
    *
    * (E.1) New creased edge points – the midpoint Q of the old edge if sharpness >=1.0, or <0.
    * (E.2) New smooth edge points – the weighted average 1/4(3Q + R) when sharpness === 0;
    * (E.3) New blended crease edge points – the linear interpolation of
    *    point rules (E.1) and (E.2) with weight σ ∈ (0, 1),
    */
   refineEdgeRange: function(subd, source, computeSubdivideMid, start, stop) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
      const destV = subd.v;
      const destH = subd.h;
      const hEdges = source.h;

      const midEdge = [0.0, 0.0, 0.0];
      const attr = source.createAttributeInterpolator();

      let offset = source.v.lengthPt();
      for (let [wEdge, left, right] of hEdges.rangeIter(start,stop)) {
         const leftV = hEdges.origin(left);
         const rightV = hEdges.origin(right);
         let valence = 6;                    // no boundary, valence === 6
         // get sharpness
         let sharpness = hEdges.wSharpness(wEdge);
         if ((sharpness < 0) || (sharpness >= 1)) {   // e1
            if (sharpness >= 1) {
               sharpness -= 1;
            } else {
               valence = 4;                  // boundary, valence == 4
            }
            // e1, crease mid-edge.
            vec3.scale(midEdge, 0, src, leftV*3, 0.5);
            vec3a.scaleAndAdd(midEdge, 0, src, rightV*3, 0.5);
         } else { // e2, or e3
            let q = 3/8, r = 1/8;   // e2
            if (sharpness !== 0) {  // blend, e3
               let u = 1.0 - sharpness;
               q = q*u + (0.5*sharpness);
               r = r*u;
            }
            sharpness = 0;          // between (0,1) - after subdivide, goes to 0
            // compute smooth, blend mid-Edge
            const leftV1 = hEdges.origin( hEdges.prev(left) );
            const rightV1 = hEdges.origin( hEdges.prev(right) );

            vec3.scale(midEdge, 0, src, leftV*3, q);
            vec3a.scaleAndAdd(midEdge, 0, src, rightV*3, q);
            vec3a.scaleAndAdd(midEdge, 0, src, leftV1*3, r);
            vec3a.scaleAndAdd(midEdge, 0, src, rightV1*3, r);
         }


         // copy over, midEdge
         vec3.copy(dest, (offset + wEdge) * 3, midEdge, 0);
         // copy over new sharpness
         destH.setwSharpness(wEdge*2, sharpness);
         destH.setwSharpness(wEdge*2+1, sharpness);
         // and setup outEdge pointer
         destV.setHalfEdge(offset+wEdge, computeSubdivideMid(left));
         destV.setValence(offset+wEdge, valence);
         destV.setCrease(offset+wEdge, sharpness);


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
   },

   /**
    *
    * @param {*} subd
    * @param {*} source
    * @param {*} computeSubdividehEdge
    * (V.1) New corner vertex points – the old vertex point V ,
    * (V.2) New crease vertex points – the weighted average (3/4V + 1/8(a+b)) === 1/4(3V + S),
    * (V.3) New smooth vertex points – the average (1 − nβn )V + βn n · T ,
    * (v.4) New blended vertex points – the linear interpolation of point rules (V.2) and (V.3) with weight σ̄ ∈ (0, 1),
    */
   refineVertexRange: function(subd, source, computeSubdividehEdge, start, stop) {
      const src = source.v.positionBuffer();
      const dest = subd.v.positionBuffer();
      const srchEdges = source.h;
      const srcV = source.v;

      const pt = [0, 0, 0];
      // copy over and setup hEdge pointer
      for (let vertex of srcV.rangeIter(start, stop)) {
         const valence = srcV.valence(vertex);
         let crease = srcV.crease(vertex);
         if (crease < 0) {             // corner, don't change
            vec3.copy(dest, vertex*3, src, vertex*3);
         } else if (crease >= 1) {     // crease
            vec3.scale(pt, 0, src, vertex*3, 3/4);
            for (let inEdge of srcV.inEdgeIter(vertex)) {
               if (srchEdges.sharpness(inEdge) !== 0) {
                  const out = srchEdges.origin(inEdge);
                  vec3a.scaleAndAdd(pt, 0, src, out*3, 1/8);
               }
            }
            vec3.copy(dest, vertex*3, pt, 0);
            crease -= 1;
         } else {
            // compute push down
            let beta = 3/16;
            const k = valence;
            if (k > 3) {
               beta = 3 / (8*k);
            }
            // smooth or blend
            if (crease === 0) {        // smooth
               vec3.scale(pt, 0, src, vertex*3, 1 - k*beta);
               for (let inEdge of srcV.inEdgeIter(vertex)) {
                  const out = srchEdges.origin(inEdge);
                  vec3a.scaleAndAdd(pt, 0, src, out*3, beta);
               }
            } else { // (0,1) blend between smooth and crease
               const smooth = 1 - crease;
               vec3.scale(pt, 0, src, vertex*3, smooth*(1 - k*beta) + crease*(3/4));
               for (let inEdge of srcV.inEdgeIter(vertex)) {
                  const out = srchEdges.origin(inEdge);
                  if (srchEdges.sharpness(inEdge) !== 0) {
                     vec3a.scaleAndAdd(pt, 0, src, out*3, beta * smooth + 1/8 * crease);
                  } else {
                     vec3a.scaleAndAdd(pt, 0, src, out*3, beta * smooth);
                  }
               }
            }

            vec3.copy(dest, vertex*3, pt, 0);
            crease = 0;
         }


         const hEdge = srcV.halfEdge(vertex);
         subd.v.setHalfEdge(vertex, computeSubdividehEdge(hEdge));
         subd.v.setValence(vertex, valence);         // valence of the original vertex don't change
         subd.v.setCrease(vertex, crease);
      }
   },

   refineEdge: function(data) {
      this.refineEdgeRange(gObj.subd, gObj.source, triMesh.computeSubdivideMid, data.start, data.stop);
   },

   refineVertex: function(data) {
      this.refineVertexRange(gObj.subd, gObj.source, triMesh.computeSubdividehEdge, data.start, data.stop);
   },

   subdivideFace: function(data) {
      this.subdivideFaceRange(gObj.subd, gObj.source, data.start, data.stop);
   },

   subdivideHole: function(data) {
      this.subdivideHoleRange(gObj.subd, gObj.source, data.start, data.stop);
   },

   // subdivideFace and related functions
   computeWEdgeLo: function(srcH, wEdge, hEdge) {
      const i = (srcH.wEdgeLeft(srcH.wEdge(hEdge)) === hEdge) ? 1 : 0;
      return wEdge * 2 + i;
   },

   computePairLo: function(srcH, hEdge) {
      const pair = srcH.pair(hEdge);
      if (pair >= 0) {
         const [face, index] = DirectedEdgeArray.faceAndIndex(pair);
         return face*3*4 + ((index*3+5)%9);
      } else { // boundaryEdge, multiply by 2-i
         return pair*2-1;
      }
   },

   computeWEdgeHi: function(srcH, wEdge, hEdge) {
      const i = (srcH.wEdgeLeft(srcH.wEdge(hEdge)) === hEdge) ? 0 : 1;
      return wEdge * 2 + i;
   },

   computePairHi: function(srcH, hEdge) {
      const pair = srcH.pair(hEdge);
      if (pair >= 0) {
         const [face, index] = DirectedEdgeArray.faceAndIndex(pair);
         return face*3*4 + index*3;
      } else { // boundaryEdge, multiply by 2,
         return pair*2;
      }
   },

   /**
    each face divide to 4 face, wEdge*3,
   */
   subdivideFaceRange: function(subd, source, start, stop) {
      const srcH = source.h;
      const subdH = subd.h;
      const subdF = subd.f;

      const wEdgeOffset = srcH.lengthW() * 2;        // original wEdge expand by *2
      const offset = source.v.length();
      for (let face of source.f.rangeIter(start, stop)) {
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
            let newWEdge = this.computeWEdgeLo(srcH, wEdge[i], srcEdge+i);
            let newPair = this.computePairLo(srcH, srcEdge+i);
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

            newWEdge = this.computeWEdgeHi(srcH, wEdge[j], srcEdge+j);
            newPair = this.computePairHi(srcH, srcEdge+j);
            subdH.setOrigin(destEdge+2, offset+wEdge[j]);
            subdH._setPair(destEdge+2, newPair);
            subdH.setWEdge(destEdge+2, newWEdge);

            subdF._setMaterial(destFace+i, material);

            // prepare next face
            destEdge += 3;
         }
         // middle and last face
         subdF._setMaterial(destFace+3, material);

//         subdF._materialAddRef(material, 4);
      }

   },

   subdivideHoleRange: function(subd, source) {
      const srcH = source.h;
      const subdH = subd.h;
      // boundaryEdge expand by 2 only, also free boundaryEdge expand by 2. +1 (0, 1) 1 is extra free
      subdH._freeBoundaryCount = (srcH._freeBoundaryCount*2) + 1;
      let head = srcH._fEdges.get(0, fEdgeK.next);
      subdH._fEdges.set(1, fEdgeK.next, head*2);
      subdH._fEdges.set(0, fEdgeK.next, -1);
      subdH._allocBEdge(srcH._fEdges.length()*2-1);
      for (let bEdge of srcH._fEdgeIter()) { // expand by 2
         let hole = srcH.hole(bEdge);
         if (hole < 0) {   // yes this is boundary edge,
            // (pair, next, prev hole) next, prev, expand by 2,
            let bEdge2 = bEdge*2;
            let newPair = this.computePairLo(srcH, bEdge);
            subdH.setPair(bEdge2, newPair);
            subdH.linkNext(bEdge2, bEdge2-1); // next is increment in negative int
            subdH.setHole(bEdge2, hole);      // hole don't change

            // the expand hi edge,
            bEdge2 -= 1;
            newPair = this.computePairHi(srcH, bEdge);
            subdH.setPair(bEdge2, newPair);
            let next = srcH.next(bEdge);
            subdH.linkNext(bEdge2, next*2);
            subdH.setHole(bEdge2, hole);      // hole don't change
         } else { // freeList, expand the freeList by 2,
            subdH._fEdges.set(-bEdge*2, fEdgeK.next, bEdge*2-1);
            const next = srcH._fEdges.get(-bEdge, fEdgeK.next);
            subdH._fEdges.set(-bEdge*2+1, fEdgeK.next, next*2);
         }
      }

      const subdO = subd.o;
      // create new holes in destination.
      subdO._copy(source.o);
      // now iterating hole to set the correct new HalfEdge
      for (let hole of subdO) {
         let bEdge = subdO.halfEdge(hole);
         subdO.setHalfEdge(hole, bEdge*2);
      }
   },


   cleanUp: function(_data) {
      gObj.source = null;
      gObj.subd = null;
      gHandler = init;
      return;
   },

}

let gHandler = init;

// the main
onmessage = function(e) {
   const ret = gHandler[e.data.fn](e.data);
   if (e.data.fn !== "cleanUp"){
      postMessage(e.data.fn + gObj.id);
   }
}

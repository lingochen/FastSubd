- Loop/MBFly subdivision using PolyMesh halfEdge. @done(2022/04/09) 
     - except for attributes, which needs to be refactored.
     - reuse attribute like vertex.

- Holes management in PolyMesh/TriMesh. (why? easier to select boundary edges as group)
     - add HoleArray handling.
     - subdivide holes handling 

- Support Boundary and Crease, investigated discontinuity of attributes.
     - boundary edge
     - crease edge/vertex

- properly account for unused slot.

- webworker parallel subidivision support.

- Displaced Subdivision Surface.

- GLSL shader.

- Quad/Tri subdivision scheme
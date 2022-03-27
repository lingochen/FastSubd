# Simple and Fast Subdivision
[Demo](https://rawcdn.githack.com/lingochen/FastSubd/1802f84704c39676f9551dd7610e75b086fc1a39/index.html).
require WebGL 2.

Any feedback, problem, remark or question about the code, contact me at boeing.chen@gmail.com


## Screenshots
![Spot no subdivision](./media/spot_subd0.png) ![Spot subdivision level 1](./media/spot_subd1.png)


## Benefits
Simple to implemented.

Tiny amount of data. Since compute improve faster than bandwidth, we want to optimize for data size.

Perfectly suit for web based workflow.


## TODO
Loop subdivision for PolyMesh halfEdge.

Support Boundary and Crease.

Quad/Tri subdivision scheme.

Displaced Subdivision Surface. 


## Info
Inspired by [A HalfEdge Refinement Rule for Parallel Catmull-Clark Subdivision](https://onrendering.com/) by Jonathan Dupuy, Kenneth Vanhoey

Major difference is that instead of using quad after one subdivision, we still use the same halfEdge representation for subdivision.

The same HalfEdge representation can be used for other subdivision schemes.

Loop and Modified Butterfly subdivision use an optimized triangle repsentation, DirectedEdge, but the DirectedEdge has the same API as HalfEdge.


## Performance
Subdivision is memory access bound instead of compute bound. Rearrange data, use share data structure, and compress data to improve performance.

Use mesh shader or compute shader to expand data in chip to improve performance.

Simple and Fast Subdivision [Demo](https://rawcdn.githack.com/lingochen/FastSubd/04fba52d917413c4d84c17c760741c878605e2e4/index.html).

Inspired by "A HalfEdge Refinement Rule for Parallel Catmull-Clark Subdivision" by Jonathan Dupuy, Kenneth Vanhoey

Major difference is that instead of using quad after one subdivision, we still use the same halfEdge representation for subdivision.

Loop and Modified Butterfly subdivision use DirectedEdge instead of HalfEdge, but the DirectedEdge has the same api as HalfEdge.



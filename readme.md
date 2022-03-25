Simple and Fast Subdivision [Demo](https://rawcdn.githack.com/lingochen/FastSubd/df6e2416af7a60f636a1eb68c47132e85b6f2485/index.html).

Inspired by "A HalfEdge Refinement Rule for Parallel Catmull-Clark Subdivision" by Jonathan Dupuy, Kenneth Vanhoey

Major difference is that instead of using quad after one subdivision, we still use the same halfEdge representation for subdivision.

Loop and Modified Butterfly subdivision use DirectedEdge instead of HalfEdge, but the DirectedEdge has the same api as HalfEdge.



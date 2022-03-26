Simple and Fast Subdivision [Demo](https://rawcdn.githack.com/lingochen/FastSubd/671585e620c85f16d387511680fd7997ac2f140e/index.html).

Inspired by [A HalfEdge Refinement Rule for Parallel Catmull-Clark Subdivision](https://onrendering.com/) by Jonathan Dupuy, Kenneth Vanhoey

Major difference is that instead of using quad after one subdivision, we still use the same halfEdge representation for subdivision.

The same HalfEdge representation can be used for other subdivision schemes.

Loop and Modified Butterfly subdivision use an optimized triangle repsentation, DirectedEdge, but the DirectedEdge has the same API as HalfEdge.


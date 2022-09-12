multiple webworkers working the same SharedBufferArray turn out to be slower than 1 webworker.
SharedBufferArray probably is very expensive to update even without atomic.
give up on the ideas but saved the implementation for future consideration.
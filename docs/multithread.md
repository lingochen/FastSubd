as of today (2022/09/14)

firefox don't support import module in webworker.

in chrome

multiple webworkers working the same SharedBufferArray turn out to be slower than 1 webworker.

SharedBufferArray probably is very expensive to update even without atomic.

give up on the ideas but saved the implementation for future consideration.

postMessage() is also fairly slow. So more challenge to structure data and code to use webworker
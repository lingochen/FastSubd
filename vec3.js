/**
  vec3 utility functions, using (array, index).

*/

const vec3 = {
add: function(out, k, arr0, i, arr1, j) {
   out[k]   = arr0[i]   + arr1[j];
   out[k+1] = arr0[i+1] + arr1[j+1];
   out[k+2] = arr0[i+2] + arr1[j+2];

   return out;
},

sub: function(out, k, a, i, b, j) {
   out[k]   = a[i] - b[j];
   out[k+1] = a[i+1] - b[j+1];
   out[k+2] = a[i+2] - b[j+2];

   return out;
},

copy: function(dest, i, source, j) {
   dest[i]   = source[j];
   dest[i+1] = source[j+1];
   dest[i+2] = source[j+2];

   return dest;
},

lerp: function(out, k, arr0, i, arr1, j, u) {
   out[k]   = arr0[i]   + u * (arr1[j]   - arr0[i]);
   out[k+1] = arr0[i+1] + u * (arr1[j+1] - arr0[i+1]);
   out[k+2] = arr0[i+2] + u * (arr1[j+2] - arr0[i+2]);

   return out;
},

scale: function(out, k, arr, i, u) {
   out[k]   = arr[i]   * u;
   out[k+1] = arr[i+1] * u;
   out[k+2] = arr[i+2] * u;

   return out;
},

scaleAndAdd: function(out, k, arr0, i, arr1, j, u) {
   out[k]   = arr0[i]   + arr1[j]   * u;
   out[k+1] = arr0[i+1] + arr1[j+1] * u;
   out[k+2] = arr0[i+2] + arr1[j+2] * u;

   return out;
},

cross: function(out, k, a, i, b, j) {
   const ax = a[i], ay = a[i+1], az = a[i+2];
   const bx = b[j], by = b[j+1], bz = b[j+2];

   out[k]   = ay * bz - az * by;
   out[k+1] = az * bx - ax * bz;
   out[k+2] = ax * by - ay * bx;
   
   return out;
},


}

const vec3a = {

add: function(dest, i, source, j) {
   dest[i]   += source[j];
   dest[i+1] += source[j+1];
   dest[i+2] += source[j+2];

   return dest;
},

copy: function(dest, i, source, j) {
   dest[i]   = source[j];
   dest[i+1] = source[j+1];
   dest[i+2] = source[j+2];

   return dest;
},

scale: function(dest, i, x) {
   dest[i]   *= x;
   dest[i+1] *= x;
   dest[i+2] *= x;

   return dest;
},

scaleAndAdd: function(dest, i, source, j, x) {
   dest[i]   += source[j]   * x;
   dest[i+1] += source[j+1] * x;
   dest[i+2] += source[j+2] * x;

   return dest;
},

normalize: function(dest, i) {
  let x = dest[i];
  let y = dest[i+1];
  let z = dest[i+2];

  let len = x * x + y * y + z * z;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
  }

  dest[i]   *= len;
  dest[i+1] *= len;
  dest[i+2] *= len;

  return dest;
},

}

export {
   vec3,
   vec3a,
}

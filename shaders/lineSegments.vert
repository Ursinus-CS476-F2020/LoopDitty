attribute vec3 vPos;
attribute vec3 vColor;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
uniform float uPointSize;

varying vec3 fColor;

void main(void) {
    gl_PointSize = uPointSize;
    gl_Position = uPMatrix * uMVMatrix * vec4(vPos, 1.0);
    fColor = vColor;
}

/**
 * Flatten a 2D array to a Float32Array
 * @param {2D array} X A 2D array
 */
function flatten32(X) {
    let N = X.length;
    let ret = new Float32Array(N*3);
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < 3; j++) {
            ret[i*3+j] = X[i][j];
        }
    }
    return ret;
}

/**
 * Return a mean-centered version of a point cloud
 * @param {2d array} X An Nxd point cloud
 * @return A version of X where the mean of each dimension is 0
 */
function getMeanCentered(X) {
    let N = X.length;
    let ret = [];
    // Allocate space for ret
    for (let i = 0; i < N; i++) {
        ret.push([]);
        for (let j = 0; j < X[i].length; j++) {
            ret[i].push(0);
        }
    }
    // Compute mean
    for (let j = 0; j < X[0].length; j++) {
        let mean = 0;
        for (let i = 0; i < N; i++) {
            mean += X[i][j];
        }
        mean /= N;
        // Subtract off mean
        for (let i = 0; i < N; i++) {
            ret[i][j] = X[i][j] - mean;
        }
    }
    return ret;
}

/**
 * Normalize the points by the standard deviation of each dimension,
 * divided by the square root of the ambient dimension
 * @param {2d array} X An Nxd point cloud
 */
function getSTDevNorm(X) {
    let N = X.length;
    let ret = getMeanCentered(X);
    for (let j = 0; j < X[0].length; j++) {
        // Compute standard deviation
        let stdev = 0.0;
        for (let i = 0; i < N; i++) {
            stdev += ret[i][j]*ret[i][j];
        }
        if (stdev > 0) {
            stdev = Math.sqrt(stdev/(N-1));
            let norm = stdev*Math.sqrt(N);
            // Divide by standard deviation and square root of N
            for (let i = 0; i < N; i++) {
                ret[i][j] /= norm;
            }
        }
    }
    return ret;
}

/**
 * Return a z-normalized version of the points
 * @param {2d array} X An Nxd point cloud
 */
function getZNorm(X) {
    let N = X.length;
    let ret = getMeanCentered(X);
    for (let i = 0; i < N; i++) {
        // Compute norm
        let norm = 0.0;
        for (let j = 0; j < X[i].length; j++) {
            norm += ret[i][j]*ret[i][j];
        }
        if (norm > 0) {
            norm = Math.sqrt(norm);
            // Divide each dimension by norm
            for (let j = 0; j < X[i].length; j++) {
                ret[i][j] /= norm;
            }
        }
    }
    return ret;
}

/**
 * Scale the entries of the matrix uniformly
 * @param {2d array} X The matrix 
 * @param {float} scale Scale to apply to each entry
 */
function scaleMatrix(X, scale) {
    for (let i = 0; i < X.length; i++) {
        for (let j = 0; j < X[i].length; j++) {
            X[i][j] *= scale;
        }
    }
}

/**
 * 
 * @param {2d array} X An Nxd point cloud
 * @param {int} winLength Number of lags to take
 * @return {2d array} XLag an (N-winLength+1) x d*winLength point cloud
 */
function getDelayEmbedding(X, winLength) {
    let XLag = [];
    let Win = X.length - winLength + 1;
    for (let i = 0; i < Win; i++) {
        XLag.push(X[i]);
        for (let di = 1; di < winLength; di++) {
            XLag[i] = XLag[i].concat(X[i+di]);
        }
    }
    return XLag;
}

/**
 * Take a running mean of each feature dimension in a sliding window
 * @param {2d array} X An Nxd point cloud
 * @param {int} winLength Length of sliding window
 */
function getWindowMean(X, winLength) {
    M = X.length - winLength + 1;
    // Compute first window
    let XSum = [];
    let XMean = [[]];
    for (let j = 0; j < X[0].length; j++) {
        let sum = 0.0;
        for (let i = 0; i < winLength; i++) {
            sum += X[i][j];
        }
        XSum.push(sum);
        XMean[0].push(sum/winLength);
    }
    for (let i = 1; i < M; i++) {
        XMean[i] = [];
        for (let j = 0; j < X[i].length; j++) {
            XSum[j] = XSum[j] - X[i-1][j] + X[i+winLength-1][j];
            XMean[i].push(XSum[j]/winLength);
        }
    }
    return XMean;
}

/**
 * 
 * @param {2d array} X An Nxd point cloud
 * @param {int} winLength Length of sliding window
 * @param {2d array} XMean Mean array with this window length.  If undefined,
 *                  compute it on the fly
 */
function getWindowSTDev(X, winLength, XMean) {
    M = X.length - winLength + 1;
    if (XMean === undefined) {
        XMean = getWindowMean(X, winLength);
    }
    // Compute first window
    let XSTDev = [];
    for (let i = 0; i < M; i++) {
        XSTDev[i] = [];
        for (let j = 0; j < X[i].length; j++) {
            let sum = 0.0;
            for (let di = 0; di < winLength; di++) {
                sum += Math.pow(X[i+di][j] - XMean[i][j], 2);
            }
            XSTDev[i][j] = Math.sqrt(sum/(winLength-1));
        }
    }
    return XSTDev;
}

/**
 * Simple implementation of the power method to find
 * the dominant eigenvector of a matrix
 * @param {2D array} A An NxM matrix
 * @param {int} NIters Number of iterations to go
 * @returns A Mx1 matrix representing the eigenvector
 */
function getDominantEigenvector(A, NIters) {
    var dim = A[0].length;
    var V = numeric.random([dim, 1]);
    var iter;
    var k;
    var norm = 0;
    //Now, do iteration
    for (iter = 0; iter < NIters; iter++) {
        V = numeric.dot(A, V);
        norm = 0.0;
        for (k = 0; k < dim; k++) {
            norm += V[k][0]*V[k][0];
        }
        norm = Math.sqrt(norm);
        for (k = 0; k < dim; k++) {
            V[k][0] /= norm;
        }
    }
    return V;
}

/**
 * Perform PCA on a point cloud
 * @param {2D array} X An Nxd point cloud
 * @param {int} num Projection to which to do PCA
 * @param {int} NIters Number of iterations in the power method
 */
function doPCA(X, num, NIters) {
    var N = X.length;
    var dim = X[0].length;
    num = Math.min(num, dim);
    var Y = numeric.clone(X);
    var res = numeric.rep([N, num], 0.0);
    var A;
    var V;
    var proj;
    for (var j = 0; j < num; j++) {
        A = numeric.dot(numeric.transpose(Y), Y);
        V = getDominantEigenvector(A, NIters);
        proj = numeric.dot(X, V);
        for (var i = 0; i < N; i++) {
            //Copy over projection as the j^th coordinate
            res[i][j] = proj[i][0]; 
            //Now subtract off the projection
            for (var k = 0; k < dim; k++) {
                Y[i][k] -= proj[i][0]*V[k][0];
            }
        }
    }
    return res;
}

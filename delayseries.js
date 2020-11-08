importScripts("jslibs/numeric-1.2.6.min.js");
importScripts("matrixutils.js");

/**
 * Create a 3D projection of the data
 */
onmessage = function(event) {
    let using = event.data.using;

    for (let param in using) {
        if (param in this.features) {
            let Xi = normFn(this.features[param]);
            if (X.length == 0) {
                X = Xi;
            }
            else {
                // Concatenate dimensions
                for (let i = 0; i < Xi.length; i++) {
                    for (let j = 0; j < Xi[i].length; j++) {
                        X[i].push(Xi[j]);
                    }
                }
            }
        }
        else {
            console.log("Warning: Asking for parameter " + param + ", but does not exist in audio features");
        }
    }

    var MusicParams = event.data.MusicParams;
    var musicFeatures = event.data.musicFeatures;
    postMessage({type:"newTask", taskString:"Computing Delay Embedding and 3D Projection"});
    var hopSize = parseFloat(musicFeatures.hopSize);
    var Fs = parseFloat(musicFeatures.Fs);
    var hopSizeSec = hopSize/Fs;
    var NIn = musicFeatures.Flux[0].length;
    if (NIn == 0) {
        return;
    }

    //First figure out how many dimensions there are
    var dim = 0;
    if (MusicParams.usingMFCC) {
        dim += musicFeatures.MFCC.length;
    }
    if (MusicParams.usingChroma) {
        dim += musicFeatures.Chroma.length;
    }
    if (MusicParams.usingRoloff) {
        dim++;
    }
    if (MusicParams.usingFlux) {
        dim++;
    }
    if (MusicParams.usingZeroCrossings) {
        dim++;
    }

    //Pre-allocate space for input and output arrays
    postMessage({type:"newTask", taskString:"Copying Fields / Computing Derivatives"});
    var NDim = dim;
    if (MusicParams.usingDerivatives) {
        NDim = dim*2;
    }
    var Segs = numeric.rep([NIn, NDim], 0);

    //Step 1: Loop through and copy all of the fields into the segments
    var i = 0;//Used to index window
    var j = 0;//Used to index delay
    var k = 0;//Used to index dimension
    for (i = 0; i < NIn; i++) {
        j = 0;
        if (MusicParams.usingMFCC) {
            for (k = 0; k < musicFeatures.MFCC.length; k++) {
                Segs[i][j] = parseFloat(musicFeatures.MFCC[k][i]);
                j++;
            }
        }
        if (MusicParams.usingChroma) {
            for (k = 0; k < musicFeatures.Chroma.length; k++) {
                Segs[i][j] = parseFloat(musicFeatures.MFCC[k][i]);
                j++;
            }
        }
        if (MusicParams.usingRoloff) {
            Segs[i][j] = parseFloat(musicFeatures.Roloff[0][i]);
            j++;
        }
        if (MusicParams.usingFlux) {
            Segs[i][j] = parseFloat(musicFeatures.Flux[0][i]);
            j++;
        }
        if (MusicParams.usingZeroCrossings) {
            Segs[i][j] = parseFloat(musicFeatures.ZeroCrossings[0][i]);
            j++;
        }
    }

    //Step 2: Compute magnitude discrete derivatives along each dimension
    //and put them in the second half of the dimensions (cumulative sum
    //of these is like total variation)
    if (MusicParams.usingDerivatives) {
        for (i = 0; i < NIn-1; i++) {
            for (k = 0; k < dim; k++) {
                Segs[i][dim+k] = Math.abs(Segs[i+1][k] - Segs[i][k]);
            }
        }
        dim = dim*2; //From now on, there are twice as many dimensions
        //(raw feature and derivative)
    }


    //Step 3: Loop through and take the average of the normal and
    //derivative features in the window
    postMessage({type:"newTask", taskString:"Computing block means"});
    //Allocate output variables
    var Win = Math.floor(MusicParams.TimeWin/hopSizeSec);
    Win = Math.max(Win, 2);
    var NOut = NIn - Win + 1;
    var X = numeric.rep([NOut, dim], 0);
    var tout = numeric.rep([NOut], 0);
    //Variables used for fast cumulative sums with mean
    var cumsum = numeric.rep([dim], 0);
    //Setup for sliding window average
    for (j = 0; j < Win; j++) {
        for (k = 0; k < dim; k++) {
            cumsum[k] += Segs[j][k];
        }
    }
    //Compute the first mean
    for (k = 0; k < dim; k++) {
        X[0][k] = cumsum[k] / Win;
    }

    //Compute the rest of the means
    for (i = 1; i < NOut; i++) {
        tout[i] = hopSizeSec*i;
        //Subtract off oldest part and add newest part
        //to get new sliding window sum
        for (k = 0; k < dim; k++) {
            cumsum[k] -= Segs[i-1][k];
            cumsum[k] += Segs[i+Win-1][k];
            X[i][k] = cumsum[k] / Win;
        }
    }

    //Step 4: Compute and subtract off mean of each dimension
    postMessage({type:"newTask", taskString:"Normalizing"});
    var mean = numeric.rep([dim], 0);
    for (i = 0; i < NOut; i++) {
        for (k = 0; k < dim; k++) {
            mean[k] += X[i][k];
        }
    }
    for (var k = 0; k < dim; k++) {
        mean[k] /= NOut;
    }
    for (i = 0; i < NOut; i++) {
        for (k = 0; k < dim; k++) {
            X[i][k] -= mean[k];
        }
    }

    //Step 5: Compute standard deviation and scale every component
    var std = numeric.rep([dim], 0);
    for (i = 0; i < NOut; i++) {
        for (k = 0; k < dim; k++) {
            std[k] += X[i][k]*X[i][k];
        }
    }
    for (k = 0; k < dim; k++) {
        std[k] = Math.sqrt(std[k]/(NOut-1));
        if (std[k] <= 0) {
            std[k] = 1; //Prevent divide by zero
        }
    }
    for (i = 0; i < NOut; i++) {
        for (k = 0; k < dim; k++) {
            X[i][k] /= std[k];
        }
    }

    //Step 5.5: If the user so chooses, do sphere normalization
    if (MusicParams.sphereNormalize) {
        var Norm = 0.0;
        for (i = 0; i < NOut; i++) {
            Norm = 0.0;
            for (k = 0; k < dim; k++) {
                Norm += X[i][k]*X[i][k];
            }
            Norm = Math.sqrt(Norm);
            for (k = 0; k < dim; k++) {
                X[i][k] /= Norm;
            }
        }
    }

    //Step 6: Do PCA
    postMessage({type:"newTask", taskString:"Computing PCA"});
    //NOTE: It's possible to have 3 or fewer features based on user
    //choices, in which case PCA can be skipped
    if (dim > 3) {
        X = doPCA(X, 3, 100);
    }

    //Step 7: Store the first 3 principal components, and make the 4th
    //component the time of occurrence
    Y = numeric.rep([NOut, 4], 0);
    for (i = 0; i < NOut; i++) {
        for (k = 0; k < X[i].length; k++) {
            Y[i][k] = X[i][k];
        }
        Y[i][3] = tout[i];
    }

    //Step 8: Subtract off mean and scale by standard deviation of each
    //component in the projected space
    if (!MusicParams.SphereNormalize) {
        var mean = numeric.rep([3], 0);
        for (i = 0; i < NOut; i++) {
            for (k = 0; k < 3; k++) {
                mean[k] += Y[i][k];
            }
        }
        for (i = 0; i < NOut; i++) {
            for (k = 0; k < 3; k++) {
                Y[i][k] -= mean[k]/NOut;
            }
        }
        var std = numeric.rep([3], 0);
        for (i = 0; i < NOut; i++) {
            for (k = 0; k < 3; k++) {
                std[k] += (Y[i][k]-mean[k])*(Y[i][k]-mean[k]);
            }
        }
        for (k = 0; k < 3; k++) {
            std[k] = Math.sqrt(std[k]/(NOut-1));
            if (std[k] == 0) {
                std[k] = 1;
            }
        }
        for (i = 0; i < NOut; i++) {
            for (k = 0; k < 3; k++) {
                Y[i][k] /= std[k];
            }
        }
    }

    postMessage({type:"end", Y:Y});
}

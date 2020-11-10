/**
 * Web worker for computing a 3D embedding of the audio features
 */
importScripts("jslibs/numeric-1.2.6.min.js");
importScripts("matrixutils.js");

function stringToFn(s) {
    let normFn = function(X) {
        return X;
    }
    if (s === "getSTDevNorm") {
        normFn = getSTDevNorm;
    }
    else if(s === "getZNorm") {
        normFn = getZNorm;
    }
    else if (!(s === "None")) {
        postMessage({type:"warning", warning:"Non-existent normalization function " + s + " specified; defaulting to no normalization"});
    }
    return normFn;
}

/**
 * Create a 3D projection of the data
 */
onmessage = function(event) {
    let features = event.data.features;
    let featureWeights = event.data.featureWeights;
    let featureNormFn = stringToFn(event.data.featureNorm);
    let jointNormFn = stringToFn(event.data.jointNorm);

    // Step 1: Normalize and concatenate features
    let X = [];
    for (let param in featureWeights) {
        if (param in features) {
            if (featureWeights[param] > 0) {
                postMessage({type:"newTask", taskString:"Normalizing " + param});
                let Xi = featureNormFn(features[param]);
                scaleMatrix(Xi, featureWeights[param]);
                if (X.length == 0) {
                    X = Xi;
                }
                else {
                    // Concatenate dimensions
                    for (let i = 0; i < Xi.length; i++) {
                        X[i] = X[i].concat(Xi[i]);
                    }
                }
            }
        }
        else {
            postMessage({type:"warning", warning:"Asking for parameter " + param + ", but does not exist in audio features"});
        }
    }

    // Step 2: Perform a stacked embedding
    let delayOpts = event.data.delayOpts;
    let winLength = delayOpts.winLength;
    if (winLength > 1) {
        if (delayOpts.delayEmbedding) {
            postMessage({type:"newTask", taskString:"Computing Delay Embedding"});
            X = getDelayEmbedding(X, winLength);
        }
        else {
            let XMean = undefined;
            let XSTDev = undefined;
            if (delayOpts.mean) {
                postMessage({type:"newTask", taskString:"Computing Window Means"});
                XMean = getWindowMean(X, winLength);
                if (!delayOpts.stdev) {
                    X = XMean;
                }
            }
            if (delayOpts.stdev) {
                postMessage({type:"newTask", taskString:"Computing Window Standard Deviations"});
                XSTDev = getWindowSTDev(X, winLength, XMean);
                if (!delayOpts.mean) {
                    X = XSTDev;
                }
            }
            if (delayOpts.mean && delayOpts.stdev) {
                X = XMean;
                for (let i = 0; i < X.length; i++) {
                    X[i] = X[i].concat(XSTDev[i]);
                }
            }
        }
    }

    // Step 3: Normalizing joint embedding
    postMessage({type:"newTask", taskString:"Normalizing Joint Embedding"});
    X = jointNormFn(X);

    //Step 4: Do PCA
    let dim = X[0].length;
    postMessage({type:"newTask", taskString:"Computing PCA"});
    //NOTE: It's possible to have 3 or fewer features based on user
    //choices, in which case PCA can be skipped
    if (dim > 3) {
        X = doPCA(X, 3, 100);
    }

    postMessage({type:"end", X:X});
}

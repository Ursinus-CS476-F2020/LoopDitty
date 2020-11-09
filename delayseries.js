importScripts("jslibs/numeric-1.2.6.min.js");
importScripts("matrixutils.js");

/**
 * Create a 3D projection of the data
 */
onmessage = function(event) {
    let using = event.data.using;
    let normFnStr = event.data.normFn;
    let features = event.data.features;
    let normFn = getZNorm;
    if (normFnStr === "getSTDevNorm") {
        normFn = getSTDevNorm;
    }
    else if(normFnStr === "getZNorm") {
        normFn = getZNorm;
    }
    else {
        postMessage({type:"warning", warning:"Non-existent normalization function " + normFnStr + " specified; defaulting to getZNorm"});
    }

    // Step 1: Normalize and concatenate features
    let X = [];
    X = features['mfcc'];
    postMessage({type:"debug", debug:"X[0].length = " + X[0].length});
    /*for (let param in using) {
        if (param in features) {
            postMessage({type:"newTask", taskString:"Normalizing " + param});
            let Xi = normFn(features[param]);
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
        else {
            postMessage({type:"warning", warning:"Asking for parameter " + param + ", but does not exist in audio features"});
        }
    }*/

    // Step 2: Perform a stacked embedding
    let winLength = event.data.winLength;
    postMessage({type:"newTask", taskString:"Computing Delay Embedding"});
    if (winLength > 1) {
        let XLag = [];
        let Win = X.length - winLength + 1;
        for (let i = 0; i < Win; i++) {
            XLag.push(X[i]);
            for (let di = 1; di < winLength; di++) {
                XLag[i] = XLag[i].concat(X[i+di]);
            }
        }
        X = XLag;
    }

    //Step 3: Do PCA
    let dim = X[0].length;
    postMessage({type:"newTask", taskString:"Computing PCA"});
    //NOTE: It's possible to have 3 or fewer features based on user
    //choices, in which case PCA can be skipped
    if (dim > 3) {
        X = doPCA(X, 3, 100);
    }
    postMessage({type:"debug", debug:"X[0].length = " + X[0].length});

    postMessage({type:"end", X:X});
}

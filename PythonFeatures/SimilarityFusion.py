"""
Programmer: Chris Tralie, 12/2016 (ctralie@alumni.princeton.edu)
Purpose: To implement similarity network fusion approach described in
[1] Wang, Bo, et al. "Unsupervised metric fusion by cross diffusion." Computer Vision and Pattern Recognition (CVPR), 2012 IEEE Conference on. IEEE, 2012.
[2] Wang, Bo, et al. "Similarity network fusion for aggregating data types on a genomic scale." Nature methods 11.3 (2014): 333-337.
[3] Tralie, Christopher et. al. "Enhanced Hierarchical Music Structure Annotations via Feature Level Similarity Fusion." ICASSP 2019
"""
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from scipy import sparse
import scipy.io as sio
import time
import os
import librosa
import subprocess
from CSMSSMTools import *
from Laplacian import *

def getW(D, K, Mu = 0.5):
    """
    Return affinity matrix
    :param D: Self-similarity matrix
    :param K: Number of nearest neighbors
    :param Mu: Nearest neighbor hyperparameter (default 0.5)
    """
    #W(i, j) = exp(-Dij^2/(mu*epsij))
    DSym = 0.5*(D + D.T)
    np.fill_diagonal(DSym, 0)

    Neighbs = np.partition(DSym, K+1, 1)[:, 0:K+1]
    MeanDist = np.mean(Neighbs, 1)*float(K+1)/float(K) #Need this scaling
    #to exclude diagonal element in mean
    #Equation 1 in SNF paper [2] for estimating local neighborhood radii
    #by looking at k nearest neighbors, not including point itself
    Eps = MeanDist[:, None] + MeanDist[None, :] + DSym
    Eps = Eps/3
    Denom = (2*(Mu*Eps)**2)
    Denom[Denom == 0] = 1
    W = np.exp(-DSym**2/Denom)
    return W

def getP(W, diagRegularize = False):
    """
    Turn a similarity matrix into a proability matrix,
    with each row sum normalized to 1
    :param W: (MxM) Similarity matrix
    :param diagRegularize: Whether or not to regularize
    the diagonal of this matrix
    :returns P: (MxM) Probability matrix
    """
    if diagRegularize:
        P = 0.5*np.eye(W.shape[0])
        WNoDiag = np.array(W)
        np.fill_diagonal(WNoDiag, 0)
        RowSum = np.sum(WNoDiag, 1)
        RowSum[RowSum == 0] = 1
        P = P + 0.5*WNoDiag/RowSum[:, None]
        return P
    else:
        RowSum = np.sum(W, 1)
        RowSum[RowSum == 0] = 1
        P = W/RowSum[:, None]
        return P

def getS(W, K):
    """
    Same thing as P but restricted to K nearest neighbors
        only (using partitions for fast nearest neighbor sets)
    (**note that nearest neighbors here include the element itself)
    :param W: (MxM) similarity matrix
    :param K: Number of neighbors to use per row
    :returns S: (MxM) S matrix
    """
    N = W.shape[0]
    J = np.argpartition(-W, K, 1)[:, 0:K]
    I = np.tile(np.arange(N)[:, None], (1, K))
    V = W[I.flatten(), J.flatten()]
    #Now figure out L1 norm of each row
    V = np.reshape(V, J.shape)
    SNorm = np.sum(V, 1)
    SNorm[SNorm == 0] = 1
    V = V/SNorm[:, None]
    [I, J, V] = [I.flatten(), J.flatten(), V.flatten()]
    S = sparse.coo_matrix((V, (I, J)), shape=(N, N)).tocsr()
    return S


def doSimilarityFusionWs(Ws, K = 5, niters = 20, reg_diag = 1, reg_neighbs = 0.5, \
        do_animation = False, PlotNames = [], PlotExtents = None, verboseTimes = True):
    """
    Perform similarity fusion between a set of exponentially
    weighted similarity matrices
    :param Ws: An array of NxN affinity matrices for N songs
    :param K: Number of nearest neighbors
    :param niters: Number of iterations
    :param reg_diag: Identity matrix regularization parameter for
        self-similarity promotion
    :param reg_neighbs: Neighbor regularization parameter for promoting
        adjacencies in time
    :param do_animation: Save an animation of the cross-diffusion process
    :param PlotNames: Strings describing different similarity
        measurements for the animation
    :param PlotExtents: Time labels for images
    :return D: A fused NxN similarity matrix
    """
    tic = time.time()
    #Full probability matrices
    Ps = [getP(W) for W in Ws]
    #Nearest neighbor truncated matrices
    Ss = [getS(W, K) for W in Ws]

    #Now do cross-diffusion iterations
    Pts = [np.array(P) for P in Ps]
    nextPts = [np.zeros(P.shape) for P in Pts]
    if verboseTimes:
        print("Time getting Ss and Ps: %g"%(time.time() - tic))

    N = len(Pts)
    AllTimes = []
    if do_animation:
        res = 5
        plt.figure(figsize=(res*N, res*2))
    for it in range(niters):
        ticiter = time.time()
        if do_animation:
            for i in range(N):
                plt.subplot(1, N, i+1)
                Im = 1.0*Pts[i]
                np.fill_diagonal(Im, 0)
                if PlotExtents:
                    plt.imshow(np.log(5e-2+Im), interpolation = 'none', cmap = 'afmhot', \
                    extent = (PlotExtents[0], PlotExtents[1], PlotExtents[1], PlotExtents[0]))
                    plt.xlabel("Time (sec)")
                    plt.ylabel("Time (sec)")
                else:
                    plt.imshow(np.log(5e-2+Im), interpolation = 'none', cmap = 'afmhot')
                plt.title(PlotNames[i])
            plt.savefig("SSMFusion%i.png"%it, dpi=300, bbox_inches='tight')
            plt.clf()
        for i in range(N):
            nextPts[i] *= 0
            tic = time.time()
            for k in range(N):
                if i == k:
                    continue
                nextPts[i] += Pts[k]
            nextPts[i] /= float(N-1)

            #Need S*P*S^T, but have to multiply sparse matrix on the left
            tic = time.time()
            A = Ss[i].dot(nextPts[i].T)
            nextPts[i] = Ss[i].dot(A.T)
            toc = time.time()
            AllTimes.append(toc - tic)
            if reg_diag > 0:
                nextPts[i] += reg_diag*np.eye(nextPts[i].shape[0])
            if reg_neighbs > 0:
                arr = np.arange(nextPts[i].shape[0])
                [I, J] = np.meshgrid(arr, arr)
                #Add diagonal regularization as well
                nextPts[i][np.abs(I - J) == 1] += reg_neighbs

        Pts = nextPts
        if verboseTimes:
            print("Elapsed Time Iter %i of %i: %g"%(it+1, niters, time.time()-ticiter))
    if verboseTimes:
        print("Total Time multiplying: %g"%np.sum(np.array(AllTimes)))
    FusedScores = np.zeros(Pts[0].shape)
    for Pt in Pts:
        FusedScores += Pt
    return FusedScores/N

def doSimilarityFusion(Scores, K = 5, niters = 20, reg_diag = 1, \
        reg_neighbs = 0.5, do_animation = False, PlotNames = [], PlotExtents = None):
    """
    Do similarity fusion on a set of NxN distance matrices.
    Parameters the same as doSimilarityFusionWs
    :returns (An array of similarity matrices for each feature, Fused Similarity Matrix)
    """
    #Affinity matrices
    Ws = [getW(D, K) for D in Scores]
    return (Ws, doSimilarityFusionWs(Ws, K, niters, reg_diag, reg_neighbs, \
                    do_animation, PlotNames, PlotExtents))


def get_graph_obj(W, K=10, res = 400):
    """
    Return an object corresponding to a nearest neighbor graph
    Parameters
    ----------
    W: ndarray(N, N)
        The N x N time-ordered similarity matrix
    K: int
        Number of nearest neighbors to use in graph representation
    res: int
        Target resolution of resized image
    """
    fac = 1
    if res > -1:
        fac = int(np.round(W.shape[0]/float(res)))
        res = int(W.shape[0]/fac)
        WRes = imresize(W, (res, res))
    else:
        res = W.shape[0]
        WRes = np.array(W)
    np.fill_diagonal(WRes, 0)
    pix = np.arange(res)
    I, J = np.meshgrid(pix, pix)
    WRes[np.abs(I - J) == 1] = np.max(WRes)
    c = plt.get_cmap('Spectral')
    C = c(np.array(np.round(np.linspace(0, 255,res)), dtype=np.int32))
    C = np.array(np.round(C[:, 0:3]*255), dtype=int)
    colors = C.tolist()

    K = min(int(np.round(K*2.0/fac)), res) # Use slightly more edges
    print("res = %i, K = %i"%(res, K))
    S = getS(WRes, K).tocoo()
    I, J, V = S.row, S.col, S.data
    V *= 10
    ret = {}
    ret["nodes"] = [{"id":"%i"%i, "color":colors[i]} for i in range(res)]
    ret["links"] = [{"source":"%i"%I[i], "target":"%i"%J[i], "value":"%.3g"%V[i]} for i in range(I.shape[0])]
    ret["fac"] = fac
    return ret


def get_structure_features(chroma, mfcc, tempogram, hop_length, y, sr, final_times, ndim=12):
    """
    Compute a structural embedding based on a meet matrix obtained
    from hierarchical clustering of a fused feature similarity matrix
    Parameters
    ----------
    chroma: ndarray(d1, N)
        Chroma features
    mfcc: ndarray(d2, N)
        MFCC features
    tempogram: ndarray(d2, N)
        Tempogram features
    hop_length: int
        Hop length between frames in samples
    y: ndarray(NSamples)
        Audio samples
    sr: int
        Sample rate
    final_times: ndarray(N)
        Times (in seconds) of each feature frame
    ndim: int
        Number of dimensions to take in structural embedding
    Returns
    -------
    Y: ndarray(N, ndim)
        Structure embedding
    """
    import mir_eval
    lapfn = getRandomWalkLaplacianEigsDense
    specfn = lambda v, dim, times: spectralClusterSequential(v, dim, times, rownorm=False)
    win_fac=10
    wins_per_block=20
    K=3
    reg_diag=1.0
    reg_neighbs=0.0
    niters=10
    neigs=10

    ## Step 1: Synchronize features to intervals
    nHops = int((y.size-hop_length*win_fac*wins_per_block)/hop_length)
    intervals = np.arange(0, nHops, win_fac)
    n_frames = np.min([chroma.shape[1], mfcc.shape[1], tempogram.shape[1]])
    # median-aggregate chroma to suppress transients and passing tones
    intervals = librosa.util.fix_frames(intervals, x_min=0, x_max=n_frames)
    times = intervals*float(hop_length)/float(sr)

    chroma = librosa.util.sync(chroma, intervals, aggregate=np.median)
    chroma = chroma[:, :n_frames]
    mfcc = librosa.util.sync(mfcc, intervals)
    mfcc = mfcc[:, :n_frames]
    tempogram = librosa.util.sync(tempogram, intervals)
    tempogram = tempogram[:, :n_frames]
    

    ## Step 2: Do a delay embedding and compute SSMs
    XChroma = librosa.feature.stack_memory(chroma, n_steps=wins_per_block, mode='edge').T
    DChroma = getCSMCosine(XChroma, XChroma) #Cosine distance
    XMFCC = librosa.feature.stack_memory(mfcc, n_steps=wins_per_block, mode='edge').T
    DMFCC = getCSM(XMFCC, XMFCC) #Euclidean distance
    XTempogram = librosa.feature.stack_memory(tempogram, n_steps=wins_per_block, mode='edge').T
    DTempogram = getCSM(XTempogram, XTempogram)

    ## Step 3: Run similarity network fusion
    FeatureNames = ['MFCCs', 'Chromas']
    Ds = [DMFCC, DChroma, DTempogram]
    # Edge case: If it's too small, zeropad SSMs
    for i, Di in enumerate(Ds):
        if Di.shape[0] < 2*K:
            D = np.zeros((2*K, 2*K))
            D[0:Di.shape[0], 0:Di.shape[1]] = Di
            Ds[i] = D
    pK = K
    # Do fusion on all features
    Ws = [getW(D, pK) for D in Ds]
    WFused = doSimilarityFusionWs(Ws, K=pK, niters=niters, \
        reg_diag=reg_diag, reg_neighbs=reg_neighbs, \
        do_animation=False, PlotNames=FeatureNames, \
        PlotExtents=[times[0], times[-1]]) 

    ## Step 4: Perform spectral clustering and a dimension
    # reduction via an SVD on the meet matrix
    vs = lapfn(WFused)
    labels = [specfn(vs, k, times) for k in range(2, neigs+1)]
    specintervals_hier = [res['intervals_hier'] for res in labels]
    speclabels_hier = [res['labels_hier'] for res in labels]
    interval = 0.25
    L = np.asarray(mir_eval.hierarchy._meet(specintervals_hier, speclabels_hier, interval).todense())
    times = interval*np.arange(L.shape[0])
    U, s, _ = linalg.svd(L)
    s = s[0:ndim]
    X = U[:, 0:ndim]*s[None, :]
    # Interpolate to final times
    Y = np.zeros((final_times.size, ndim))
    for i in range(ndim):
        Y[:, i] = np.interp(final_times, times, X[:, i])
    return Y
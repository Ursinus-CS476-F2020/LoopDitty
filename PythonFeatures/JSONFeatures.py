#Programmer: Chris Tralie
#Purpose: To extract features for use with LoopDitty
import numpy as np
import os
import matplotlib.pyplot as plt
import json
import base64
import time
import librosa
from sklearn.decomposition import PCA
import argparse
from SimilarityFusion import get_structure_features


# Dimensions to which to reduce the tempogram
TEMPOGRAM_DIMRED = 20

def get_base64_file(filename):
    """
    Load a file in as base64 binary
    Parameters
    ----------
    filename: string
        Path to file to load
    """
    fin = open(filename, "rb")
    b = fin.read()
    b = base64.b64encode(b)
    fin.close()
    return b.decode("ASCII")

#http://stackoverflow.com/questions/1447287/format-floats-with-standard-json-module
class PrettyFloat(float):
    def __repr__(self):
        return '%.4g' % self
def pretty_floats(obj):
    if isinstance(obj, float):
        return PrettyFloat(obj)
    elif isinstance(obj, dict):
        return dict((k, pretty_floats(v)) for k, v in obj.items())
    elif isinstance(obj, (list, tuple)):
        return map(pretty_floats, obj)
    return obj

def extract_features_json(filename, jsonfilename, song_name = "test song", sr=44100, hop_length = 512, mfcc_win = 22050):
    """
    Compute features and save them as a JSON file
    Parameters
    ----------
    filename: string
        Path to audio
    jsonfilename: string
        Path to audio output
    song_name: string
        Name of song
    sr: int
        Audio sample rate
    hop_length: int
        Hop length between windows, in samples
    mfcc_win: int
        Window length for mfccs, in samples
    """
    Results = {'songname':filename}
    print("Saving results...")
    ## Step 1: Add music to the JSON output as base64 binary
    _, ext = os.path.splitext(filename)
    Results['audio'] = "data:audio/%s;base64, "%ext[1::] + get_base64_file(filename)
    ## Step 2: Load the audio for processing in Python
    print("Loading %s..."%filename)
    y, sr = librosa.load(filename, sr=sr)


    ## Step 3: Compute features
    # 1) CQT chroma
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    # 2) Exponentially liftered MFCCs
    S = librosa.feature.melspectrogram(y, sr=sr, n_mels=128, hop_length=hop_length, n_fft = mfcc_win, win_length = mfcc_win)
    log_S = librosa.power_to_db(S, ref=np.max)
    mfcc = librosa.feature.mfcc(S=log_S, n_mfcc=20)
    lifterexp = 0.6
    coeffs = np.arange(mfcc.shape[0])**lifterexp
    coeffs[0] = 1
    mfcc = coeffs[:, None]*mfcc
    # 3) Tempograms
    #  Use a super-flux max smoothing of 5 frequency bands in the oenv calculation
    SUPERFLUX_SIZE = 5
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length,
                                        max_size=SUPERFLUX_SIZE)
    tempogram = librosa.feature.tempogram(onset_envelope=oenv, sr=sr, hop_length=hop_length)
    # 4) Spectral features
    x1 = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)
    x2 = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)
    x3 = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop_length)
    x4 = librosa.feature.spectral_flatness(y=y, hop_length=hop_length)
    x5 = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)
    spectral = np.concatenate((x1, x2, x3, x4, x5), axis=0)
    # 5) Structure features
    times = np.arange(mfcc.shape[1])*hop_length/sr
    Results['times'] = times.tolist()
    structure = get_structure_features(chroma, mfcc, tempogram, hop_length, y, sr, times)

    chroma = chroma.T
    mfcc = mfcc.T
    tempogram = tempogram.T
    pca = PCA(n_components=TEMPOGRAM_DIMRED)
    tempogram = pca.fit_transform(tempogram)
    print("Tempogram variance explained: %.3g"%np.sum(pca.explained_variance_ratio_))
    spectral = spectral.T

    features = {'chroma':chroma.tolist(), 'mfcc':mfcc.tolist(), 'tempogram':tempogram.tolist(), 'spectral':spectral.tolist(), 'structure':structure.tolist()}
    Results['features'] = features


    c = plt.get_cmap('Spectral')
    C = c(np.array(np.round(np.linspace(0, 255,chroma.shape[0])), dtype=np.int32))
    Results['colors'] = C.tolist()
    Results['songName'] = song_name

    fout = open(jsonfilename, "w")
    fout.write(json.dumps(Results))
    fout.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--filename', type=str, required=True, help="Path to audio file")
    parser.add_argument('--outname', type=str, required=True, help="Path to audio file")
    parser.add_argument('--song_name', type=str, help="Name to display for the song")
    parser.add_argument('--sr', type=int, default=44100, help='Sample rate to use')
    parser.add_argument('--hop_length', type=int, default=512, help='Hop length between features')
    parser.add_argument('--mfcc_win', type=int, default=22050, help='Length of MFCC window')
    opt = parser.parse_args()
    extract_features_json(opt.filename, opt.outname, opt.song_name, opt.hop_length, opt.mfcc_win)
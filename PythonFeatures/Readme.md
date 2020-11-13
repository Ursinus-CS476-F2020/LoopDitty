## Dependencies
To setup python dependencies, type

~~~~~ bash
pip install scikit-learn
pip install librosa
pip install mir-eval
~~~~~

## Running

To compute features for a particular audio file, type

~~~~~ bash
python JSONFeatures.py --filename audio.mp3 --outname out.json
~~~~~

where audio.mp3 is the path to the input audio file, and out.json is the path to the output JSON file that will be loaded into LoopDitty

For a full list of options, please type
~~~~~ bash
python JSONFeatures --help
~~~~~
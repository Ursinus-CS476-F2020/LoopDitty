

/**
 * A class for storing an audio buffer and audio features
 */
class AudioObj {
    /**
     * @param {DOM Element} audioWidgetDOM DOM element for audio controls
     * @param {ProgressBar} progressBar Progress bar object (shared with canvas)
     */
    constructor(audioWidgetDOM, progressBar) {
        this.audioWidget = audioWidgetDOM;
        this.progressBar = progressBar;
        this.times = [0];
        this.colors = [];
        this.features = {};
    }

    updateParams(params) {
        this.audioWidget.src = params.audio;
        this.times = params.times;
        this.colors = params.colors;
        this.features = params.features;
    }
    
    /**
     * Compute a 3D projection of the selected audio features using a specified
     * normalization followed by PCA
     * @param {object} using An object whose fields are feature names
     *                       and whose values are true/false
     * @param {function} normFn A function to normalize the point cloud
     *                          for each feature
     * @param {int} winLength The length of the sliding window.
     *                        If undefined, it should be 1.
     * @return An promise that resolves to an unrolled Float32Array 
     *         of 3D coordinates
     */
    get3DProjection(using, normFn, winLength) {
        if (winLength === undefined) {
            winLength = 1;
        }
        let audioObj = this;
        this.progressBar.loadColor = "yellow";
        this.progressBar.loading = true;
        this.progressBar.changeLoad();
        return new Promise((resolve, reject) => {
            let worker = new Worker("delayseries.js");
            worker.postMessage({normFn:normFn, using:using, features:audioObj.features, winLength:winLength});
            worker.onmessage = function(event) {
                if (event.data.type == "newTask") {
                    audioObj.progressBar.loadString = event.data.taskString;
                }
                else if (event.data.type == "warning") {
                    console.log("Warning: " + event.data.warning);
                }
                else if (event.data.type == "debug") {
                    console.log("Debug: " + event.data.debug);
                }
                else if (event.data.type == "end") {
                    audioObj.progressBar.changeToReady();
                    resolve(flatten32(event.data.X));
                }
            }
        });
    }

    /**
     * An unrolled Float32Array of colors 
     */
    getColorsArray() {
        return flatten32(this.colors);
    }

    /**
     * Return the index of the row with the closest time to
     * the currently playing time in the audio widget
     */
    getClosestIdx() {
        //TODO: Make a binary search
        let time = this.audioWidget.currentTime;
        let t = 0;
		let mindiff = Math.abs(time - this.times[0]);
		for (let i = 1; i < this.times.length; i++) {
		    let diff = Math.abs(this.times[i] - time);
		    if (diff < mindiff) {
		        mindiff = diff;
		        t = i;
		    }
		}
		return t;
    }
}

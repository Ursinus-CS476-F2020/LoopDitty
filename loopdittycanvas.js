
class LoopDittyCanvas extends BaseCanvas {

    /**
     * @param {AudioObj} audioObj The audio object to be associated with this canvas
     * @param {ProgressBar} progressBar Progress bar object
     * @param {DOM Element} fileInput File input button
     * @param {DOM Element} glcanvas Handle to HTML where the glcanvas resides
     * @param {string} shadersrelpath Path to the folder that contains the shaders,
     *                                relative to where the constructor is being called
     */
    constructor(audioObj, progressBar, fileInput, glcanvas, shadersrelpath) {
        super(glcanvas, shadersrelpath);
        this.audioObj = audioObj;
        this.progressBar = progressBar;
        this.camera = new MousePolarCamera(glcanvas.width, glcanvas.height);
        this.setupMenubar(fileInput);
        this.setupShaders();
    }

    /**
     * Setup the GUI elements, including dat.GUI and fileInput handler
     * @param {DOM Element} fileInput File input button
     */
    setupMenubar(fileInput) {
        let canvas = this;
        let gui = new dat.GUI();
        this.gui = gui;
        this.displayOptsFolder = gui.addFolder("Display Options");

        this.audioFolder = gui.addFolder("Audio Options");
        this.songName = "Untitled";
        this.audioFolder.add(this, "songName");
        this.audioFolder.add(this, "updateGeometry");
        this.winLength = 1;
        this.audioFolder.add(this, "winLength", 1, 100, 1);
        this.normFn = "getSTDevNorm";
        this.audioFolder.add(this, "normFn", ["getSTDevNorm", "getZNorm"]).listen().onChange(
            function() {
                canvas.updateGeometry();
            }
        );
        this.featureToggleFolder = this.audioFolder.addFolder("Audio Features");
        this.selectedFeatures = {};

        
        // Setup the handler for file input, assuming there is a DOM
        // element called "fileInput"
        this.fileInput = fileInput;
        fileInput.addEventListener('change', function(e) {
            let file = fileInput.files[0];
            let reader = new FileReader();
            reader.onload = function(e) {
                let params = JSON.parse(reader.result);
                canvas.setupSong(params);
            };
            reader.readAsText(file);
        });

    }

    /**
     * Initialize a promise for the lineSegment shader that will be fulfilled
     * once the asynchronous code load completes and the shader compiles
     */
    setupShaders() {
        this.vertexVBO = -1;
        this.colorVBO = -1;
        let canvas = this;
        this.shader = getShaderProgramAsync(canvas.gl, "shaders/lineSegments");
        this.shader.then(function(shader) {
            let gl = canvas.gl;
            shader.description = 'A shader for drawing lines with a constant color';
            shader.vPosAttrib = gl.getAttribLocation(shader, "vPos");
            gl.enableVertexAttribArray(shader.vPosAttrib);
            shader.vColorAttrib = gl.getAttribLocation(shader, "vColor");
            gl.enableVertexAttribArray(shader.vColorAttrib);
            shader.pMatrixUniform = gl.getUniformLocation(shader, "uPMatrix");
            shader.mvMatrixUniform = gl.getUniformLocation(shader, "uMVMatrix");
            shader.pointSizeUniform = gl.getUniformLocation(shader, "uPointSize");
            shader.shaderReady = true;
            canvas.shader = shader;
        });
    }

    loadPrecomputedSong(file) {
        // TODO: Finish this
        /*progressBar.loadString = "Reading data from server";
        progressBar.loadColor = "red";
        progressBar.loading = true;
        progressBar.changeLoad();
    
        var xhr = new XMLHttpRequest();
        xhr.open('GET', file, true);
        xhr.responseType = 'json';
        xhr.onload = function(err) {
            setupSong(this.response);
        };
        progressBar.loading = true;
        progressBar.ndots = 0;
        progressBar.changeLoad();
        xhr.send();*/
    
    }

    /**
     * Determine the bounding box of a curve and use
     * that to update the camera info
     * @param {array} X A flattened array of 3D points
     */
    updateBBox(X) {
        let bbox = [X[0], X[0], X[1], X[1], X[2], X[2]];
        for (let i = 0; i < X.length/3; i++) {
            if (X[i*3] < bbox[0]) {
                bbox[0] = X[i*3];
            }
            if (X[i*3] > bbox[1]) {
                bbox[1] = X[i*3];
            }
            if (X[i*3+1] < bbox[2]) {
                bbox[2] = X[i*3+1];
            }
            if (X[i*3+1] > bbox[3]) {
                bbox[3] = X[i*3+1];
            }
            if (X[i*3+2] < bbox[4]) {
                bbox[4] = X[i*3+2];
            }
            if (X[i*3+2] > bbox[5]) {
                bbox[5] = X[i*3+2];
            }
        }
        this.camera.centerOnBBox(new AABox3D(bbox[0], bbox[1], bbox[2], bbox[3], bbox[4], bbox[5]));
    }

    updateGeometry() {
        let canvas = this;
        if (!('shaderReady' in this.shader)) {
            // Wait for the shader promise to be fulfilled, then try again
            this.shader.then(canvas.updateGeometry.bind(canvas));
        }
        else {
            let XPromise = this.audioObj.get3DProjection(this.selectedFeatures, this.normFn, this.winLength);
            XPromise.then(function(X) {
                let N = X.length/3;
                if (N <= 0) {
                    return;
                }
                canvas.updateBBox(X);
                //Initialize vertex buffers
                if (canvas.vertexVBO == -1) {
                    canvas.vertexVBO = canvas.gl.createBuffer();
                }
                canvas.gl.bindBuffer(canvas.gl.ARRAY_BUFFER, canvas.vertexVBO);
                canvas.gl.bufferData(canvas.gl.ARRAY_BUFFER, X, canvas.gl.STATIC_DRAW);
                canvas.vertexVBO.itemSize = 3;
                canvas.vertexVBO.numItems = N;
            
                //Initialize color buffers
                if (canvas.colorVBO == -1) {
                    canvas.colorVBO = canvas.gl.createBuffer();
                }
                canvas.gl.bindBuffer(canvas.gl.ARRAY_BUFFER, canvas.colorVBO);
                canvas.gl.bufferData(canvas.gl.ARRAY_BUFFER, canvas.audioObj.getColorsArray(), canvas.gl.STATIC_DRAW);
                canvas.colorVBO.itemSize = 3; 
                canvas.colorVBO.numItems = N;
                canvas.progressBar.changeToReady();
                requestAnimationFrame(canvas.repaint.bind(canvas));
            });
        }
    }

    setupSong(params) {
        if (!this.gl) {
            alert("Error: GL not properly initialized, so cannot display new song");
            return;
        }
        let canvas = this;
        // Add features to the menu bar as toggles
        this.audioFolder.removeFolder(this.featureToggleFolder);
        this.featureToggleFolder = this.audioFolder.addFolder("Features");
        this.selectedFeatures = {};
        for (let feature in params.features) {
            this.selectedFeatures[feature] = true;
            this.featureToggleFolder.add(this.selectedFeatures, feature).listen(function() {
                canvas.updateGeometry();
            });
        }
        this.songName = params.songName;
        //Setup audio buffers
        this.audioObj.updateParams(params);
        this.updateGeometry();
    }

    /**
     * Redraw the canvas
     */
    repaint() {
        this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        let canvas = this;
        let playIdx = this.audioObj.getClosestIdx();
        if (!('shaderReady' in this.shader)) {
            // Wait until the promise has resolved, then draw again
            this.shader.then(canvas.repaint.bind(canvas));
        }
        else if (this.vertexVBO != -1 && this.colorVBO != -1 && playIdx > 0) {
            this.gl.useProgram(this.shader);
            this.gl.uniformMatrix4fv(this.shader.pMatrixUniform, false, this.camera.getPMatrix());
            this.gl.uniformMatrix4fv(this.shader.mvMatrixUniform, false, this.camera.getMVMatrix());
            this.gl.uniform1f(this.shader.pointSizeUniform, 3.0);

            //Step 1: Draw all points unsaturated
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexVBO);
            this.gl.vertexAttribPointer(this.shader.vPosAttrib, this.vertexVBO.itemSize, this.gl.FLOAT, false, 0, 0);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorVBO);
            this.gl.vertexAttribPointer(this.shader.vColorAttrib, this.colorVBO.itemSize, this.gl.FLOAT, false, 0, 0);
            this.gl.drawArrays(this.gl.POINTS, 0, playIdx);
            //Draw "time edge" lines between points
            this.gl.drawArrays(this.gl.LINES, 0, playIdx+1);
            this.gl.drawArrays(this.gl.LINES, 1, playIdx);
    
            //Step 2: Draw the current point as a larger point
            this.gl.uniform1f(this.shader.pointSizeUniform, 15.0);
            // TODO: See if I can get away without binding a new program
            this.gl.useProgram(this.shader);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexVBO);
            this.gl.vertexAttribPointer(this.shader.vPosAttrib, this.vertexVBO.itemSize, this.gl.FLOAT, false, 0, 0);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorVBO);
            this.gl.vertexAttribPointer(this.shader.vColorAttrib, this.colorVBO.itemSize, this.gl.FLOAT, false, 0, 0);
            this.gl.drawArrays(this.gl.POINTS, playIdx, 1);
        }
    }
}

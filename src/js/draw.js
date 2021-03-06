import { drawArrow, getBase64Data, windowToCanvas, detectLanguage } from "./utils";
import Dom from "./dom";
import Eve from './event_emitter';
class Draw {
  constructor(options) {
    const {
      container,
      bgImg = "",
      lineColor = "#f00",
      lineWidth = "1",
      arrowSize = 15,
      eraserSize = 10,
      canvasBgColor = "#fff",
      textFontSize = 16,
      textLineHeight = 20,
      textColor = "#f00",
      textareaPlaceholder = detectLanguage(),
      ratio = window.devicePixelRatio || 1,
      fontFamily="Arial"
    } = options;
    if (!container) throw Error("No container element were found...");
    this.configuration = {
      bgImg,
      ratio,
      lineColor,
      lineWidth: lineWidth * ratio,
      arrowSize: arrowSize * ratio,
      eraserSize: eraserSize * ratio,
      textFontSize: textFontSize * ratio,
      textLineHeight: textLineHeight * ratio,
      textColor,
      canvasBgColor,
      textareaPlaceholder,
      fontFamily
    };
    this.container = this.createCanvasOuterBox(container);
    this.canvas = this.createCanvasEl(this.container, this);
    this.context = this.canvas.getContext("2d");
    this.mode = "";
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.originX = null;
    this.originY = null;
    this.arrowPoints = [];
    this.isDrawing = false;
    this.image = new Image();
    this.textareaEl = null;
    this.measureEl = null;
    // cache
    this.historyImage = new Image(); // used when canceling
    this.undoQueue = []; // withdraw queue
    this.redoQueue = []; // redo queue
    this.firstDraw = null;
    // event emitter
    this.evt = new Eve();

    this.init();
  }

  createCanvasOuterBox(container) {
    const canvasOuterBoxDom = Dom.createEl('div', {
      styles: {
        height: `${container.clientHeight}px`,
        width: `${container.clientWidth}px`,
        position: 'relative',
        top: '0'
      }
    })
    Dom.appendChild(container, canvasOuterBoxDom)
    return canvasOuterBoxDom
  }

  createCanvasEl(container, context) {
    const canvasEl = Dom.createEl("canvas", {
      styles: {
        height: `${container.clientHeight}px`,
        width: `${container.clientWidth}px`,
      },
      attrs: { width: container.clientWidth * context.configuration.ratio, height: container.clientHeight * context.configuration.ratio },
    });

    console.log("Context Ratio :" + context.configuration.ratio);
    Dom.appendChild(container, canvasEl);
    return canvasEl;
  }

  init() {
    this.canvas_style = window.getComputedStyle(this.canvas);
    this.context.lineCap = 'round';
    this.clear();
    this.setBackground();
    this.createTextMeasure();
    this.canvas.addEventListener("mousedown", this.mouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.mouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.endOfDrawing.bind(this));
    this.canvas.addEventListener("mouseleave", this.endOfDrawing.bind(this));
  }

  mouseDown(event) {
    this.isDrawing = true;
    this.image.src = this.canvas.toDataURL("image/png");
    this.image.crossOrigin = "anonymous";
    this.redoQueue.length = 0
    const { clientX, clientY } = event;
    // When the mouse is pressed, the initial coordinates of the canvas (will change with the move)
    const { x, y } = windowToCanvas(this.canvas, this.canvas_style, clientX, clientY);
    this.originX = x;
    this.originY = y;

    // record the coordinates of the initial press
    this.ft_originX = this.originX;
    this.ft_originY = this.originY;

    this.context.moveTo(this.originX, this.originY);
    this.context.lineWidth = this.configuration.lineWidth;
    this.context.strokeStyle = this.configuration.lineColor;
    this.context.fillStyle = this.configuration.lineColor;
    this.context.beginPath();

    this.mode === "arrow" && this.saveArrowPoint({ x: this.originX, y: this.originY });
    this.mode === "text" && this.createTextArea({ x: this.ft_originX, y: this.ft_originY });
    
    if (this.mode && this.mode !== 'text') {
      this.evt.trigger('drawBegin', { x, y, clientX, clientY });
    }
  }

  mouseMove(event) {
    if (this.isDrawing) {
      const { clientX, clientY } = event;

      // When the mouse moves, the real-time coordinates in the canvas
      const { x, y } = windowToCanvas(this.canvas, this.canvas_style, clientX, clientY);
      // The default is the coordinates of the mouse just pressed.
      let newOriginX = this.originX,
        newOriginY = this.originY;

      // Calculate the distance from the horizontal/vertical coordinates to the initial point
      let distanceX = Math.abs(x - this.originX);
      let distanceY = Math.abs(y - this.originY);

      //Let the coordinates of the upper left corner of the shape always be greater than the coordinates of the lower right corner to ensure that the graphics can be drawn correctly
      if (x < this.originX) newOriginX = x;
      if (y < this.originY) newOriginY = y;

      // (x, y) is the real-time coordinates in the canvas. (originX / Y) are the coordinates on the canvas when the mouse is clicked
      // (newOriginX / Y) When drawing a shape (such as a rectangle), the coordinates of the upper left corner
      const mousePosition = {
        x,
        y,
        originX: this.originY,
        originY: this.originY,
        newOriginX,
        newOriginY,
        distanceX,
        distanceY,
        ft_originX: this.ft_originX,
        ft_originY: this.ft_originY
      };
      let mousemoveEvent = this.handleMousemove();
      let currMousemoveEvent = mousemoveEvent[this.mode];
      currMousemoveEvent && currMousemoveEvent(mousePosition);

      if (this.mode && this.mode !== 'text') {
        this.evt.trigger('drawing', { x, y, clientX, clientY });
      }
    }
  }


  // In the process of drawing the shape, it needs to be redrawn, otherwise the image in the moving process will be drawn
  reDraw() {
    this.context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

      //   this.image.onload = () => {
  //  console.log(this.image);
    this.context.drawImage(this.image, 0, 0);
       //  }
       //  console.log("redraw function written by sahil");
    this.context.beginPath();

  }

  endOfDrawing(event) {
    if (this.isDrawing) {
      const { clientX, clientY } = event;
      const { x, y } = windowToCanvas(this.canvas, this.canvas_style, clientX, clientY);

      this.context.closePath();
      this.isDrawing = false;
      this.addHistory();
      
      if (this.mode && this.mode !== 'text') {
        this.evt.trigger('drawEnd', { x, y, clientX, clientY });
      }
    }
  }

  addHistory() {
    let data = this.canvas.toDataURL("image/png");
    this.undoQueue.push(data);
    let _len = this.undoQueue.length;
    if (_len > 20) {
      this.firstDraw = this.undoQueue[0];
      this.undoQueue = this.undoQueue.slice(-20, _len);
    }
  }

  setBackground() {
    if (this.configuration.bgImg) {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.canvas.style.background = `url(${this.configuration.bgImg})`;
      this.canvas.style.backgroundSize = "100% 100%";
      this.canvas.style.backgroundPosition = "center";
      this.canvas.style.backgroundRepeat = "no-repeat";
      this.context.globalCompositeOperation = "source-over";
    }
  }

  handleMousemove() {
    return {
      pencil: (mousePosition) => {
        const { x, y } = mousePosition;
        this.context.lineTo(x, y);
        this.context.stroke();
      },
      straightLine: (mousePosition) => {
        let { x, y, ft_originX, ft_originY } = mousePosition;
        this.reDraw();
        this.context.moveTo(ft_originX, ft_originY);
        this.context.lineTo(x, y);
        this.context.stroke();
      },
      rect: (mousePosition) => {
        const { newOriginX, newOriginY, distanceX, distanceY } = mousePosition;
        this.reDraw();
        this.context.rect(newOriginX, newOriginY, distanceX, distanceY);
        this.context.stroke();
        this.context.closePath();
      },
      circle: (mousePosition) => {
        const { newOriginX, newOriginY, distanceX, distanceY } = mousePosition;
        this.reDraw();
        // Calculate the radius according to the dog-strand theorem
        const r = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        // Make sure the mouse is in the center of the circle (although only to the left)
        this.context.arc(
          newOriginX + distanceX,
          newOriginY + distanceY,
          r,
          0,
          2 * Math.PI
        );
        this.context.stroke();
      },
      arrow: (mousePosition) => {
        const { x, y } = mousePosition;
        this.reDraw();
        this.arrowPoints[1] = {
          x: x / this.canvasWidth,
          y: y / this.canvasHeight,
        };
        drawArrow(this.context, {
          points: this.arrowPoints,
          arrowSize: this.configuration.arrowSize,
          canvasWidth: this.canvasWidth,
          canvasHeight: this.canvasHeight,
        });
      },
      eraser: (mousePosition) => {
        const { x, y } = mousePosition;
        this.configuration.bgImg ? (this.context.globalCompositeOperation = "destination-out") : null;
        this.context.strokeStyle = this.configuration.canvasBgColor;
        this.context.fillStyle = this.configuration.canvasBgColor;
        this.context.lineWidth = this.configuration.eraserSize;
        this.context.lineTo(x, y);
        this.context.stroke();
      },
      clear: () => this.clear(),
    };
  }

  saveArrowPoint(position) {
    this.arrowPoints = [];
    this.arrowPoints.push({
      x: position.x / this.canvasWidth,
      y: position.y / this.canvasHeight,
    });
  }

  createTextMeasure() {
    if (this.measureEl) {
      Dom.removeChild(this.container, this.measureEl);
      this.measureEl = null;
    }
    this.measureEl = Dom.createEl("pre", {
      styles: {
        fontSize: `${this.configuration.textFontSize}px`,
        lineHeight: `${this.configuration.textLineHeight}px`,
        color: this.configuration.textColor,
        fontFamily: this.configuration.fontFamily,
      },
    });
    Dom.addClass(this.measureEl, "__edb-text-pre");
    Dom.appendChild(this.container, this.measureEl);
  }

  drawText(ctx, options) {
  //  options.font = options.fontFamily || '"PingFang SC","Microsoft YaHei","????????????"';
    options.font = options.fontFamily;
    let string = options.text;
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = `${options.textFontSize}px/${options.textLineHeight}px ${options.font}`;
    ctx.fillStyle = options.textColor;
    ctx.globalCompositeOperation = "source-over";
    string
      .replace(/<br>/g, "\n")
      .split(/\n/)
      .map((value, index) => {
        ctx.fillText(
          value,
          options.position.x + 2,
          options.position.y + index * options.textLineHeight + options.textLineHeight / 2 + 2
        );
      });
    ctx.restore();
  }

  createTextArea(position) {
    this.mode = null;
    if (this.boxDom) Dom.removeChild(this.container, this.boxDom);
    this.boxDom = Dom.createEl("div", {
      styles: {
        position: 'absolute',
        left: `${position.x / this.configuration.ratio}px`,
        top: `${position.y / this.configuration.ratio}px`,
        lineHeight: `${this.configuration.textLineHeight / this.configuration.ratio}px`,
        fontSize: `${this.configuration.textFontSize / this.configuration.ratio}px`,
      },
    });
    Dom.addClass(this.boxDom, "__edb-textarea-box");

    this.textareaEl = Dom.createEl("textarea", {
      styles: {
        color: this.configuration.textColor,
        lineHeight: `${this.configuration.textLineHeight / this.configuration.ratio}px`,
        fontSize: `${this.configuration.textFontSize / this.configuration.ratio}px`,
      },
      props: { placeholder: this.configuration.textareaPlaceholder },
    });
    Dom.addClass(this.textareaEl, "__edb-textarea");
    Dom.appendChild(this.boxDom, this.textareaEl);
    Dom.appendChild(this.container, this.boxDom);
    // If it does not enter the task queue, onblur will be triggered directly under mac Safari, causing the entire dom to disappear
    setTimeout(() => {
      this.textareaEl.focus();
      this.textareaEl.onblur = () => {
        this.mode = null;
        this.drawText(this.context, {
          text: this.textareaEl.value,
          textColor: this.configuration.textColor,
          textFontSize: this.configuration.textFontSize,
          textLineHeight: this.configuration.textLineHeight,
          position,
          fontFamily: this.configuration.fontFamily,
        });
        Dom.removeChild(this.container, this.boxDom);
        this.boxDom = null;
        this.textareaEl = null;
      };
      this.textareaEl.addEventListener("input", (e) => {
        this.measureEl.innerHTML = e.target.value + " ";
        this.textareaEl.style.width = this.measureEl.clientWidth / this.configuration.ratio + "px";
        this.textareaEl.style.height = this.measureEl.clientHeight / this.configuration.ratio + "px";
      });
    }, 50)
  }

  resetBgImg() {
    this.redoQueue.length = 0;
    this.undoQueue.length = 0;
    this.clear(false);
    this.setBackground();
  }

  // api
  // Change the default setting
  config(type, value) {
    if (['lineWidth', 'arrowSize', 'eraserSize', 'textFontSize', 'textLineHeight'].includes(type)) {
      this.configuration[type] = value * this.configuration.ratio;
    } else {
      this.configuration[type] = value;
    }
    switch (type) {
      case 'canvasBgColor':
        this.clear(false);
        break
      case 'bgImg':
        this.resetBgImg();
        break
      case 'textFontSize':
      case 'textColor':
      case 'textLineHeight':
      case 'fontFamily':
        this.createTextMeasure();
        break  
    }
  }

  setMode(mode) {
    this.context.globalCompositeOperation = "source-over";
    this.context.strokeStyle = this.configuration.lineColor;
    this.context.fillStyle = this.configuration.lineColor;
    this.context.lineWidth = this.configuration.lineWidth;
    mode === "eraser"
      ? Dom.addClass(this.container, "__edb-eraser-hover")
      : Dom.removeClass(this.container, "__edb-eraser-hover");

    this.mode = mode;
    if(mode =="circle"){
    
       Dom.addClass(this.container, "__edb-pencil-hover")
    
    }else{
      Dom.removeClass(this.container, "__edb-pencil-hover");
    }
  }

  undo() {
    let len = this.undoQueue.length
    if (len === 0) {return}
    else if (len === 1) { //  initial stroke
      if (this.firstDraw) {
        this.historyImage.src = this.firstDraw
      } else {
        this.redoQueue.push(this.undoQueue.pop())
        this.clear(false)
        return
      }
    } else {
      this.historyImage.src = this.undoQueue[len - 2]; // Note. If you subtract 1, it is the latest step, which is equivalent to redrawing. We need to subtract 2 here.
    } 
    this.historyImage.onload = () => {
      this.clear(false);
      this.context.drawImage(this.historyImage, 0, 0);
      this.redoQueue.push(this.undoQueue.pop())
    };
  }

  redo() {
    if (this.redoQueue.length === 0) return
    this.undoQueue.push(this.redoQueue.pop())
    this.historyImage.src = this.undoQueue[this.undoQueue.length - 1];
    this.historyImage.onload = () => {
      this.clear(false);
      this.context.drawImage(this.historyImage, 0, 0);
    };
  }

  generateBase64(type = "png") {
    return new Promise(async (resolve) => {
      if (this.configuration.bgImg) {
        const data = await getBase64Data(this.canvas, this.configuration.bgImg, type);
        resolve(data);
      } else {
        resolve(this.canvas.toDataURL(`image/${type}`));
      }
    });
  }

  async saveImg(options = { type: "png", fileName: "canvas_image" }) {
    let imgData = null;
    if (this.configuration.bgImg) {
      imgData = await getBase64Data(this.canvas, this.configuration.bgImg, options.type);
    } else {
      imgData = this.canvas.toDataURL(`image/${options.type}`);
    }
    const aEl = Dom.createEl("a", {
      attrs: {
        href: imgData,
        download: `${options.fileName}.${options.type}`,
      },
    });
    aEl.click();
  }

  clear(record = true) {
    this.context.fillStyle = this.configuration.canvasBgColor;
    this.context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (this.configuration.bgImg) {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.context.globalCompositeOperation = "source-over";
    }
    if (this.undoQueue.length && record) {
      let data = this.canvas.toDataURL("image/png");
      this.undoQueue.push(data)
    }
  }
}

export default Draw;

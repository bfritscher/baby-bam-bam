const COLORS = ["#ff5994", "#ff9668", "#edff8f", "#84ff9f", "#82b6ff"];
const FADE_TIME_MS = 2000; // must match .fade-out

if (typeof navigator.serviceWorker !== "undefined") {
  navigator.serviceWorker.register("service-worker.js");
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function randomWindowXY() {
  return {
    x: Math.floor(Math.random() * window.innerWidth),
    y: Math.floor(Math.random() * window.innerHeight),
  };
}

const ALPHANUM = new RegExp("^[a-zA-Z0-9]$");

const LOCALSTORAGE_KEY = "baby_bambam";
const LETTER_MODE_LETTER = "letter";
const LETTER_MODE_IMAGE = "image";

class Options {
  fadeAway = true;
  fadeAfter = 3; // seconds
  limitItems = true;
  maxItems = 30; // count
  throttleMS = 500;
  animateOnClick = true;
  removeOnClick = false;
  lockCursor = false;
  forceUpperCase = true;
  fontFamily = "Roboto";
  letterMode = LETTER_MODE_IMAGE;
  onlyAlphaNum = false;
  emptyBeforeRepeat = false;
  imageCollections = ["animal-alphabet-en", "numbers", "animals-en"];
  externalCollections = [];
  drawingEnabled = true;
  clicklessDrawing = false;
  drawingLineWidth = 30;
  playAudio = true;
  ttsEnabled = false;
  ttsLang = "";
  constructor() {
    this.load();
    this.setupFont();
  }
  load() {
    try {
      const savedOptions = JSON.parse(
        localStorage.getItem(LOCALSTORAGE_KEY) || "{}"
      );
      Object.keys(savedOptions).forEach((key) => {
        if (this.hasOwnProperty(key)) {
          this[key] = savedOptions[key];
        }
      });
    } catch (e) {
      console.error(e);
    }
  }
  save() {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(this));
  }
  setupFont() {
    const fontLink = document.createElement("link");
    fontLink.href = `https://fonts.googleapis.com/css2?family=${this.fontFamily.replace(
      / /g,
      "+"
    )}&display=swap`;
    fontLink.rel = "stylesheet";
    document.head.append(fontLink);
  }
}

class OptionsDialog {
  dialog;
  options;
  formElements = {};
  constructor(options) {
    this.options = options;
    this.dialog = document.getElementById("optionsDialog");
    // connect dom
    [...this.dialog.querySelectorAll("[name]")].forEach((formEl) => {
      this.formElements[formEl.name] = formEl;
      if (formEl.type === "checkbox") {
        formEl.checked = options[formEl.name];
        formEl.addEventListener("change", () => {
          options[formEl.name] = formEl.checked;
          options.save();
          if (formEl.name === "clicklessDrawing") {
            formEl.checked ? app.canvas.start() : app.canvas.stop();
          }
        });
      } else if (formEl.name === "imageCollections") {
        formEl.addEventListener("change", () => {
          options[formEl.name] = [...formEl.selectedOptions].map(
            (option) => option.value
          );
          options.save();
          app.setupCollections();
        });
      } else {
        formEl.value = options[formEl.name];
        formEl.addEventListener("change", () => {
          options[formEl.name] =
            typeof options[formEl.name] === "number"
              ? Number(formEl.value)
              : formEl.value;
          if (formEl.name === "fontFamily") {
            options.setupFont();
          }
          options.save();
        });
      }
    });
    const externalCollectionsList = document.getElementById(
      "externalCollections"
    );
    const externalCollectionAdd = document.getElementById(
      "externalCollectionAdd"
    );

    function createExternalCollectionItem(collectionsUrl) {
      const li = document.createElement("li");
      li.innerText = collectionsUrl;
      const removeButton = document.createElement("input");
      removeButton.type = "button";
      removeButton.value = "remove";
      removeButton.addEventListener("click", () => {
        options.externalCollections.splice(
          options.externalCollections.indexOf(collectionsUrl),
          1
        );
        options.save();
        li.remove();
        app.loadCollectionsIndex();
      });
      li.append(removeButton);
      externalCollectionsList.append(li);
    }
    externalCollectionAdd.addEventListener("click", () => {
      const url = prompt("URL of external collections.json file", "");
      if (url) {
        options.externalCollections.push(url);
        options.save();
        createExternalCollectionItem(url);
        app.loadCollectionsIndex();
      }
    });
    options.externalCollections.forEach(createExternalCollectionItem);
    const optionsDialogClose = document.getElementById("optionsDialogClose");
    optionsDialogClose.addEventListener("click", () => this.close());
    const fullscreenButton = document.getElementById("fullscreenButton");
    fullscreenButton.addEventListener("click", () => {
      app.toggleFullscreen();
      fullscreenButton.textContent = document.fullscreen
        ? "Fullscreen"
        : "Exit";
    });
    // If a browser doesn't support the dialog, then hide the
    // dialog contents by default.
    if (typeof this.dialog.showModal !== "function") {
      this.dialog.hidden = true;
    }
  }
  _captureEsc(e) {
    e.preventDefault();
  }
  show() {
    if (this.dialog.open) return;
    this.dialog.addEventListener("cancel", this._captureEsc);
    this.dialog.showModal();
    if (this.options.lockCursor) {
      document.exitPointerLock();
    }
  }
  close() {
    this.dialog.close();
    this.dialog.removeEventListener("cancel", this._captureEsc);
    if (this.options.lockCursor) {
      document.getElementById("canvas").requestPointerLock();
    }

    // TODO fix drawing with pointerlock    console.log( event.movementX, event.movementY);
  }
}

class CanasDraw {
  START_TIME;
  canvas;
  ctx;
  coords = {};
  options;
  refDraw;

  constructor(options) {
    this.options = options;
    this.START_TIME = new Date().getTime();
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    // TODO: pointer events for touch support?
    this.canvas.addEventListener("mousedown", this.start.bind(this));
    this.canvas.addEventListener("mouseup", this.stop.bind(this));
    this.canvas.addEventListener("touchstart", (event) => {
      [...event.touches].forEach((touch) => {
        this.coords[touch.identifier] = this.reposition(touch);
      });
    });
    this.canvas.addEventListener("touchmove", (event) => {
      [...event.touches].forEach((touch) => {
        this.draw(touch);
      });
    });
    window.addEventListener("resize", this.resize.bind(this));
    this.resize();
    this.fadeOut();
    if (this.options.clicklessDrawing) {
      this.start();
    }
  }
  resize() {
    this.ctx.canvas.width = window.innerWidth;
    this.ctx.canvas.height = window.innerHeight;
  }
  reposition(event) {
    if (!event) return { x: 0, y: 0 };
    return {
      x: event.clientX - this.canvas.offsetLeft,
      y: event.clientY - this.canvas.offsetTop,
    };
  }

  start(event) {
    if (this.refDraw) {
      this.canvas.removeEventListener("mousemove", this.refDraw);
    }
    this.canvas.addEventListener(
      "mousemove",
      (this.refDraw = this.draw.bind(this))
    );
    this.coords[-1] = this.reposition(event);
  }
  stop() {
    if (!this.options.clicklessDrawing) {
      this.canvas.removeEventListener("mousemove", this.refDraw);
    }
  }
  // TODO alternative? save points and redraw with fade
  draw(event) {
    if (!this.options.drawingEnabled) return;
    const id = event.identifier !== undefined ? event.identifier : -1;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.lineWidth = this.options.drawingLineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = `hsl(${
      ((new Date().getTime() - this.START_TIME) / 10) % 360
    } 100% 50%)`;
    if (!this.coords[id]) {
      this.coords[id] = this.reposition(event);
    }
    ctx.moveTo(this.coords[id].x, this.coords[id].y);
    this.coords[id] = this.reposition(event);
    ctx.lineTo(this.coords[id].x, this.coords[id].y);
    ctx.stroke();
    ctx.closePath();
  }

  fadeOut() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    setTimeout(this.fadeOut.bind(this), 100);
  }
}

class MainApp {
  options;
  optionsDialog;
  canvas;
  drawables = [];
  images = [];
  availableImages = [];
  audios = [];
  collections = {};
  lastTaps = {};
  lastAddedTime = 0;
  loaded = 0;
  toLoadTotal = 0;

  constructor() {
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    this.options = new Options();
    this.optionsDialog = new OptionsDialog(this.options);
    setTimeout(() => {
      this.canvas = new CanasDraw(this.options);
    });
    this.loadCollectionsIndex();

    document.addEventListener(
      "keydown",
      (event) => {
        if (this.optionsDialog.dialog.open) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (
          event.ctrlKey &&
          event.shiftKey &&
          event.altKey &&
          event.key === "O"
        ) {
          this.optionsDialog.show();
          return;
        }

        if (new Date().getTime() - this.lastAddedTime < this.options.throttleMS)
          return;

        if (
          this.options.letterMode === LETTER_MODE_LETTER &&
          event.key.match(ALPHANUM)
        ) {
          const text = this.options.forceUpperCase
            ? event.key.toLocaleUpperCase()
            : event.key;
          this.addDrawable(new StringDrawable(text));
        } else {
          if (this.availableImages.length === 0) {
            // repopulate pool of available images
            this.availableImages = this.images.slice();
          }
          let list = this.options.emptyBeforeRepeat
            ? this.availableImages
            : this.images;

          if (
            this.options.letterMode === LETTER_MODE_IMAGE &&
            event.key.match(ALPHANUM)
          ) {
            // try to find an image starting with letter
            const candidates = list.filter(
              (img) => img.name.toUpperCase()[0] === event.key.toUpperCase()
            );
            if (candidates.length === 0 && this.options.emptyBeforeRepeat) {
              const candidates2 = this.images.filter(
                (img) => img.name.toUpperCase()[0] === event.key.toUpperCase()
              );
              if (candidates2.length > 0) {
                // repopulate pool
                this.availableImages = this.availableImages.concat(
                  ...candidates2
                );
                list = candidates2;
              }
            }
            if (candidates.length > 0) {
              list = candidates;
            }
          } else if (this.options.onlyAlphaNum) {
            return;
          }
          if (list.length > 0) {
            const img = randomItem(list);
            this.availableImages.splice(this.availableImages.indexOf(img), 1);
            this.addDrawable(new ImageDrawable(img));
          } else {
            this.addDrawable(new StringDrawable("No Images"));
          }
        }
      },
      false
    );
    let longpress;
    document.addEventListener("touchstart", (event) => {
      if (longpress) return;
      longpress = setTimeout(() => {
        longpress = null;
        if (!this.optionsDialog.dialog.open) {
          this.optionsDialog.show();
        }
      }, 3000);
    });
    document.addEventListener("touchmove", (event) => {
      if (longpress) {
        clearTimeout(longpress);
        longpress = null;
      }
    });
    document.addEventListener("touchend", (event) => {
      if (longpress) {
        clearTimeout(longpress);
        longpress = null;
      }
      if (this.optionsDialog.dialog.open) return;
      // double tap detection
      const currentTime = new Date().getTime();
      [...event.changedTouches].forEach((touch) => {
        const id = touch.identifier;
        const deltaTap = currentTime - this.lastTaps[id];
        this.lastTaps[id] = currentTime;
        if (deltaTap > 0 && deltaTap < 500) {
          // TODO refactor to function with keyboard version
          if (this.availableImages.length === 0) {
            // repopulate pool of available images
            this.availableImages = this.images.slice();
          }
          let list = this.options.emptyBeforeRepeat
            ? this.availableImages
            : this.images;
          const img = randomItem(list);
          this.availableImages.splice(this.availableImages.indexOf(img), 1);
          this.addDrawable(new ImageDrawable(img));
          this.lastTaps[id] = 0;
        }
      });
      if (event.cancelable) event.preventDefault();
    });
    if (navigator.userAgentData.mobile) {
      document.getElementById("help").style.display = "none";
      document.getElementById("help-mobile").style.display = "block";
    }
    if ("ontouchstart" in document.documentElement) {
      document.getElementById("help-mobile").style.display = "block";
    }
  }
  async loadCollectionsIndex() {
    const collections = ["assets/collections.json"].concat(
      ...this.options.externalCollections
    );
    for (const collection of collections) {
      await fetch(collection, {
        mode: "cors",
      })
        .then((r) => r.json())
        .then((data) => {
          Object.assign(this.collections, data);
        })
        .catch((e) => {
          const span = document.createElement("span");
          span.innerText = `Error loading: ${e}`;
          document
            .getElementById("externalCollections")
            .children[
              this.options.externalCollections.indexOf(collection)
            ].append(span);
          console.error(e);
        });
    }
    this.setupCollections();
    this.optionsDialog.show();
  }

  addDrawable(drawable) {
    this.lastAddedTime = new Date().getTime();
    this.drawables.push(drawable);
    if (
      this.options.limitItems &&
      this.drawables.length > this.options.maxItems
    ) {
      this.drawables.shift().destroy();
    }
  }
  setupCollections() {
    this.images = [];
    this.availableImages = [];
    this.loaded = 0;
    this.toLoadTotal = 0;
    const imageCollectionsEl = document.getElementById("imageCollections");
    let child = imageCollectionsEl.lastElementChild;
    document.getElementById("preloadProgress").style.display = "block";
    while (child) {
      imageCollectionsEl.removeChild(child);
      child = imageCollectionsEl.lastElementChild;
    }
    Object.keys(this.collections).forEach((key) => {
      // add dropdown
      const option = document.createElement("option");
      option.value = key;
      option.selected = this.options.imageCollections.includes(key);
      option.innerText = this.collections[key].name;
      imageCollectionsEl.append(option);
      // load data
      if (option.selected) {
        this.setupCollection(this.collections[key]);
      }
    });
  }

  addLoaded() {
    this.loaded++;
    document.getElementById("preloadDone").innerText = this.loaded;
    if (this.toLoadTotal > 0) {
      document.getElementById("preloadProgressBar").style.width = `${
        (this.loaded / this.toLoadTotal) * 100
      }%`;
    }
    if (this.toLoadTotal === this.loaded) {
      document.getElementById("preloadProgress").style.display = "none";
    }
  }

  setupCollection(collectionRef) {
    fetch(collectionRef.url)
      .then((r) => r.json())
      .then((collection) => {
        const imagepreload = document.getElementById("imagepreload");
        collection.images.forEach((o) => {
          const img = document.createElement("img");
          img.src = o.src;
          img.setAttribute("name", o.name);
          img.onload = () => {
            this.addLoaded();
          };
          imagepreload.append(img);
          if (o.audio) {
            o.audioObj = new Audio(o.audio);
            o.audioObj.addEventListener("loadeddata", () => {
              this.addLoaded();
            });
            this.toLoadTotal++;
          }
          this.images.push(o);
          this.toLoadTotal++;
          document.getElementById("preloadTotal").innerText = this.toLoadTotal;
          document.getElementById("imagesCount").innerText = this.images.length;
          document.getElementById("audioCount").innerText = this.images.filter(
            (i) => i.audio
          ).length;
        });
      })
      .catch((e) => {
        console.error("Unable to load collection:", collectionRef, e);
      });
  }
  async toggleFullscreen() {
    if (window.self !== window.top) {
      window.open(window.location.href, "", "noopener,noreferrer");
      return;
    }
    try {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
        if ("keyboard" in navigator) {
          await navigator.keyboard.lock();
        }
        // FIX bug with canvas being over dialog after switching to fullscreen
        this.optionsDialog.close();
        this.optionsDialog.show();
        return;
      }
      if ("keyboard" in navigator) {
        navigator.keyboard.unlock();
      }
      await document.exitFullscreen();
    } catch (err) {
      alert(`${err.name}: ${err.message}`);
    }
  }
}

class Drawable {
  x = 0;
  y = 0;
  width = 200;
  height = 200;
  constructor() {
    const { x, y } = randomWindowXY();
    this.x = x;
    this.y = y;
    this.width = this.width * (Math.random() + 0.5);
    this.height = this.width;
  }
  setup() {
    this.el = document.createElement("div");
    this.el.classList.add("drawable");
    this.el.classList.add("animate-in");
    document.body.append(this.el);
    if (app.options.fadeAway) {
      setTimeout(() => {
        this.fadeOut();
      }, app.options.fadeAfter * 1000);
    }
    this.el.onclick = () => {
      if (app.options.animateOnClick) {
        this.el.classList.remove("jello");
        setTimeout(() => {
          this.el.classList.add("jello");
        });
      }
      if (app.options.removeOnClick) {
        this.fadeOut();
      }
    };
  }
  update() {
    this.el.style.width = `${this.width}px`;
    this.el.style.height = `${this.height}px`;
    // padding width
    this.el.style.left = `${Math.min(
      this.x,
      window.innerWidth - this.width
    )}px`;
    this.el.style.top = `${Math.min(
      this.y,
      window.innerHeight - this.height
    )}px`;
  }
  speak(text) {
    if (!app.options.ttsEnabled) return;
    const msg = new SpeechSynthesisUtterance();
    if (app.options.ttsLang) {
      msg.lang = app.options.ttsLang;
    }
    msg.text = text;
    window.speechSynthesis.speak(msg);
  }
  fadeOut() {
    this.el.classList.add("fade-out");
    setTimeout(() => {
      this.destroy();
    }, FADE_TIME_MS);
  }
  destroy() {
    this.el.remove();
  }
}

class ImageDrawable extends Drawable {
  image;
  audio;
  constructor(image) {
    super();
    this.image = image;
    this.setup();
    this.update();
  }
  setup() {
    super.setup();
    this.el.classList.add("drawable-image");

    this.speak(this.image.name);

    if (this.image.audio && app.options.playAudio) {
      this.audio = new Audio(this.image.audio);
      this.audio.play();
    }
  }
  update() {
    super.update();
    this.el.style.backgroundImage = `url(${this.image.src})`;
  }
  destroy() {
    if (this.audio) {
      this.audio.pause();
      delete this.audio;
    }
    super.destroy();
  }
}

class StringDrawable extends Drawable {
  fontFamily;
  fontSize = "100px";
  text = "";
  color = "#000";
  constructor(text) {
    super();
    this.text = text;
    this.color = randomColor();
    this.setup();
    this.update();
  }
  setup() {
    super.setup();
    this.el.classList.add("drawable-string");
    this.speak(this.text);
  }
  update() {
    super.update();
    this.el.style.color = this.color;
    this.el.style.fontSize = this.fontSize;
    this.el.style.fontFamily = app.options.fontFamily;
    this.el.textContent = this.text;
  }
}

const app = new MainApp();

if (window.self === window.top) {
  if (!("keyboard" in navigator)) {
    alert(
      "Your browser does not support the Keyboard Lock API. Try chrome or edge"
    );
  }
}

/* Disable back navigation */
history.pushState(null, document.title, location.href);
window.addEventListener("popstate", function (event) {
  history.pushState(null, document.title, location.href);
});

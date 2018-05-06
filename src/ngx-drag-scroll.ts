import {
  DoCheck,
  NgModule,
  Directive,
  ElementRef,
  Renderer2,
  OnDestroy,
  Input,
  Output,
  OnInit,
  OnChanges,
  EventEmitter,
  HostListener
} from '@angular/core';
import { DragScrollOption } from './interface/drag-scroll-option';

@Directive({
  selector: '[dragScroll]'
})
export class DragScrollDirective implements OnDestroy, OnInit, OnChanges, DoCheck {
  readonly MOUSE_LEFT = 1;
  readonly MOUSE_CENTER = 2;
  readonly MOUSE_RIGHT = 4;
  readonly MOUSE_BTNS = [this.MOUSE_LEFT, this.MOUSE_RIGHT, this.MOUSE_CENTER];

  private _scrollbarHidden: boolean;

  private _disabled: boolean;

  private _xDisabled: boolean;

  private _yDisabled: boolean;

  private _dragDisabled: boolean;

  private _snapDisabled: boolean;

  private _dragBtns: number = this.MOUSE_LEFT | this.MOUSE_CENTER | this.MOUSE_RIGHT;

  /**
   * Is the user currently pressing the element
   */
  isPressed = false;

  /**
   * Is the user currently scrolling the element
   */
  isScrolling = false;

  scrollTimer: number;

  scrollToTimer: number;

  /**
   * The x coordinates on the element
   */
  downX = 0;

  /**
   * The y coordinates on the element
   */
  downY = 0;

  displayType: string | null = 'block';

  elWidth: string | null;

  elHeight: string | null;

  parentNode: HTMLElement;

  wrapper: HTMLDivElement | null;

  scrollbarWidth: string;

  onMouseMoveHandler = this.onMouseMove.bind(this);
  onMouseDownHandler = this.onMouseDown.bind(this);
  onScrollHandler = this.onScroll.bind(this);
  onMouseUpHandler = this.onMouseUp.bind(this);

  mouseMoveListener: Function;
  mouseDownListener: Function;
  scrollListener: Function;
  mouseUpListener: Function;

  currIndex = 0;

  isAnimating = false;

  scrollReachesRightEnd = false;

  prevChildrenLength = 0;

  childrenArr: Array<Element> = [];

  @Output() reachesLeftBound = new EventEmitter<boolean>();

  @Output() reachesRightBound = new EventEmitter<boolean>();


  private disableScroll(axis: string): void {
    this.el.nativeElement.style[`overflow-${axis}`] = 'hidden';
  }

  private enableScroll(axis: string): void {
    this.el.nativeElement.style[`overflow-${axis}`] = 'auto';
  }

  private hideScrollbar(): void {
    if (this.el.nativeElement.style.display !== 'none' && !this.wrapper) {
      this.parentNode = this.el.nativeElement.parentNode;

      // clone
      this.wrapper = this.el.nativeElement.cloneNode(true);
      // remove all children
      if (this.wrapper !== null) {
        while (this.wrapper.hasChildNodes()) {
          if (this.wrapper.lastChild !== null) {
            this.wrapper.removeChild(this.wrapper.lastChild);
          }
        }
        this.wrapper.style.overflow = 'hidden';

        this.el.nativeElement.style.width = `calc(100% + ${this.scrollbarWidth})`;
        this.el.nativeElement.style.height = `calc(100% + ${this.scrollbarWidth})`;
        // set the wrapper as child (instead of the element)
        this.parentNode.replaceChild(this.wrapper, this.el.nativeElement);
        // set element as child of wrapper
        this.wrapper.appendChild(this.el.nativeElement);
      }
    }
  }

  private showScrollbar(): void {
    if (this.wrapper) {
      this.el.nativeElement.style.width = this.elWidth;
      this.el.nativeElement.style.height = this.elHeight;
      this.parentNode.removeChild(this.wrapper);
      this.parentNode.appendChild(this.el.nativeElement);
      this.wrapper = null;
    }
  }

  private checkScrollbar() {
    if (this.el.nativeElement.scrollWidth <= this.el.nativeElement.clientWidth) {
      this.el.nativeElement.style.height = '100%';
    } else {
      this.el.nativeElement.style.height = `calc(100% + ${this.scrollbarWidth})`;
    }
    if (this.el.nativeElement.scrollHeight <= this.el.nativeElement.clientHeight) {
      this.el.nativeElement.style.width = '100%';
    } else {
      this.el.nativeElement.style.width = `calc(100% + ${this.scrollbarWidth})`;
    }
  }

  private setScrollBar(): void {
    if (this.scrollbarHidden) {
      this.hideScrollbar();
    } else {
      this.showScrollbar();
    }
  }

  private getScrollbarWidth(): number {
    /**
     * Browser Scrollbar Widths (2016)
     * OSX (Chrome, Safari, Firefox) - 15px
     * Windows XP (IE7, Chrome, Firefox) - 17px
     * Windows 7 (IE10, IE11, Chrome, Firefox) - 17px
     * Windows 8.1 (IE11, Chrome, Firefox) - 17px
     * Windows 10 (IE11, Chrome, Firefox) - 17px
     * Windows 10 (Edge 12/13) - 12px
     */
    let widthNoScroll = 0;
    let widthWithScroll = 0;
    const outer: HTMLDivElement | null = document.createElement('div');
    if (outer !== null) {
      outer.style.visibility = 'hidden';
      outer.style.width = '100px';
      outer.style.msOverflowStyle = 'scrollbar'; // needed for WinJS apps

      document.body.appendChild(outer);

      widthNoScroll = outer.offsetWidth;
      // force scrollbars
      outer.style.overflow = 'scroll';

      // add innerdiv
      const inner = document.createElement('div');
      inner.style.width = '100%';
      outer.appendChild(inner);

      widthWithScroll = inner.offsetWidth;

      // remove divs
      if (outer.parentNode !== null) {
        outer.parentNode.removeChild(outer);
      }
    }
    /**
     * Scrollbar width will be 0 on Mac OS with the
     * default "Only show scrollbars when scrolling" setting (Yosemite and up).
     * setting defult with to 20;
     */
    return widthNoScroll - widthWithScroll || 20;
  }

  /*
  * The below solution is heavily inspired from
  * https://gist.github.com/andjosh/6764939
  */
  private scrollTo(element: Element, to: number, duration: number) {
    const self = this;
    self.isAnimating = true;
    const start = element.scrollLeft,
      change = to - start,
      increment = 20;
    let currentTime = 0;

    // t = current time
    // b = start value
    // c = change in value
    // d = duration
    const easeInOutQuad = function (t: number, b: number, c: number, d: number) {
      t /= d / 2;
      if (t < 1) {
        return c / 2 * t * t + b;
      }
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
    };

    const animateScroll = function() {
      currentTime += increment;
      element.scrollLeft = easeInOutQuad(currentTime, start, change, duration);
      if (currentTime < duration) {
          self.scrollToTimer = window.setTimeout(animateScroll, increment);
      } else {
        // run one more frame to make sure the animation is fully finished
        setTimeout(() => {
          self.isAnimating = false;
        }, increment);
      }
    };
    animateScroll();
  }

  private locateCurrentIndex(snap?: boolean) {
    const ele = this.el.nativeElement;
    this.currentChildWidth((currentClildWidth, nextChildrenWidth, childrenWidth, idx, stop) => {
      if (ele.scrollLeft >= childrenWidth &&
          ele.scrollLeft <= nextChildrenWidth) {

        if (nextChildrenWidth - ele.scrollLeft > currentClildWidth / 2 && !this.scrollReachesRightEnd) {
          // roll back scrolling
          this.currIndex = idx;
          if (snap) {
            this.scrollTo(ele, childrenWidth, 500);
          }
        } else {
          // forward scrolling
          this.currIndex = idx + 1;
          if (snap) {
            this.scrollTo(ele, childrenWidth + currentClildWidth, 500);
          }
        }
        stop();
      }
    });
  }

  private currentChildWidth(cb: (
    currentClildWidth: number,
    nextChildrenWidth: number,
    childrenWidth: number,
    index: number,
    breakFunc: () => void) => void) {
    let childrenWidth = 0;
    let shouldBreak = false;
    const breakFunc = function() {
      shouldBreak = true;
    };
    for (let i = 0; i < this.childrenArr.length; i++) {
      if (i === this.childrenArr.length - 1) {
        this.currIndex = this.childrenArr.length;
        break;
      }
      if (shouldBreak) {
        break;
      }

      const nextChildrenWidth = childrenWidth + this.childrenArr[i + 1].clientWidth;
      const currentClildWidth = this.childrenArr[i].clientWidth;
      cb(currentClildWidth, nextChildrenWidth, childrenWidth, i, breakFunc);

      childrenWidth += this.childrenArr[i].clientWidth;
    }
  }

  private toChildrenLocation(): number {
    let to = 0;
    for (let i = 0; i < this.currIndex; i++) {
      to += this.childrenArr[i].clientWidth;
    }
    return to;
  }

  private resetScrollLocation() {
    const ele = this.el.nativeElement;
    this.scrollTo(ele, 0, 0);
    this.currIndex = 0;
  }

  private markElDimension() {
    if (this.wrapper) {
      this.elWidth = this.wrapper.style.width;
      this.elHeight = this.wrapper.style.height;
    } else {
      this.elWidth = this.el.nativeElement.style.width;
      this.elHeight = this.el.nativeElement.style.height;
    }
  }

  /**
   * Whether the scrollbar is hidden
   */
  @Input('scrollbar-hidden')
  get scrollbarHidden() { return this._scrollbarHidden; }
  set scrollbarHidden(value: boolean) { this._scrollbarHidden = value; }

  /**
   * Whether horizontally and vertically draging and scrolling is be disabled
   */
  @Input('drag-scroll-disabled')
  get disabled() { return this._disabled; }
  set disabled(value: boolean) { this._disabled = value; }

  /**
   * Whether horizontally dragging and scrolling is be disabled
   */
  @Input('drag-scroll-x-disabled')
  get xDisabled() { return this._xDisabled; }
  set xDisabled(value: boolean) { this._xDisabled = value; }

  /**
   * Whether vertically dragging and scrolling events is disabled
   */
  @Input('drag-scroll-y-disabled')
  get yDisabled() { return this._yDisabled; }
  set yDisabled(value: boolean) { this._yDisabled = value; }

  @Input('drag-disabled')
  get dragDisabled() { return this._dragDisabled; }
  set dragDisabled(value: boolean) { this._dragDisabled = value; }

  @Input('snap-disabled')
  get snapDisabled() { return this._snapDisabled; }
  set snapDisabled(value: boolean) { this._snapDisabled = value; }

  @Input('drag-mouse-btns')
  get dragBtns() { return this._dragBtns; }
  set dragBtns(value: number) { this._dragBtns = value; }

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {
    this.scrollbarWidth = `${this.getScrollbarWidth()}px`;
    el.nativeElement.style.overflow = 'auto';
    el.nativeElement.style.whiteSpace = 'noWrap';

    this.mouseDownListener = renderer.listen(el.nativeElement, 'mousedown', this.onMouseDownHandler);
    this.scrollListener = renderer.listen(el.nativeElement, 'scroll', this.onScrollHandler);
    this.mouseMoveListener = renderer.listen('document', 'mousemove', this.onMouseMoveHandler);
    this.mouseUpListener = renderer.listen('document', 'mouseup', this.onMouseUpHandler);
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.markElDimension();
    this.resetScrollLocation();
    this.checkNavStatus();
  }

  public attach({disabled, scrollbarHidden, yDisabled, xDisabled, dragBtns}: DragScrollOption): void {
    this.disabled = disabled;
    this.scrollbarHidden = scrollbarHidden;
    this.yDisabled = yDisabled;
    this.xDisabled = xDisabled;
    this.dragBtns = dragBtns;
    this.ngOnChanges();
  }

  ngOnChanges() {
    this.setScrollBar();

    if (this.xDisabled || this.disabled) {
      this.disableScroll('x');
    } else {
      this.enableScroll('x');
    }

    if (this.yDisabled || this.disabled) {
      this.disableScroll('y');
    } else {
      this.enableScroll('y');
    }
  }

  ngOnInit(): void {
    // auto assign computed css
    this.displayType = window.getComputedStyle(this.el.nativeElement).display;
    this.el.nativeElement.style.display = this.displayType;

    // store ele width height for later user
    this.markElDimension();

    this.renderer.setAttribute(this.el.nativeElement, 'drag-scroll', 'true');

    // prevent Firefox from dragging images
    document.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });
  }

  ngDoCheck() {
    this.childrenArr = this.el.nativeElement.children || [];
    // avoid extra ckecks
    if (this.childrenArr.length !== this.prevChildrenLength) {
      if (this.wrapper) {
        this.checkScrollbar();
      }
      this.prevChildrenLength = this.childrenArr.length;
      this.checkNavStatus();
    }
  }


  ngOnDestroy() {
    this.renderer.setAttribute(this.el.nativeElement, 'drag-scroll', 'false');
    this.mouseMoveListener();
    this.mouseUpListener();
  }

  onMouseMove(e: MouseEvent) {
    if(!this.isButtonEnabled(e.button)) {
      return;
    }

    if (this.isPressed && !this.disabled) {
      e.preventDefault();
      // Drag X
      if (!this.xDisabled && !this.dragDisabled) {
        this.el.nativeElement.scrollLeft =
          this.el.nativeElement.scrollLeft - e.clientX + this.downX;
        this.downX = e.clientX;
      }

      // Drag Y
      if (!this.yDisabled && !this.dragDisabled) {
        this.el.nativeElement.scrollTop =
          this.el.nativeElement.scrollTop - e.clientY + this.downY;
        this.downY = e.clientY;
      }
    }
    return !this.isPressed;
  }


  onMouseDown(e: MouseEvent) {
    if(!this.isButtonEnabled(e.button)) {
      return;
    }

    this.isPressed = true;
    this.downX = e.clientX;
    this.downY = e.clientY;
    clearTimeout(this.scrollToTimer);
  }

  onScroll() {
    const ele = this.el.nativeElement;
    if ((ele.scrollLeft + ele.offsetWidth) >= ele.scrollWidth) {
      this.scrollReachesRightEnd = true;
    } else {
      this.scrollReachesRightEnd = false;
    }
    this.checkNavStatus();
    if (!this.isPressed && !this.isAnimating && !this.snapDisabled) {
      this.isScrolling = true;
      clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => {
        this.isScrolling = false;
        this.locateCurrentIndex(true);
      }, 500);
    } else {
      this.locateCurrentIndex();
    }
  }

  onMouseUp(e: MouseEvent) {
    if(!this.isButtonEnabled(e.button)) {
      return;
    }

    if (this.isPressed) {
      this.isPressed = false;
      if (!this.snapDisabled) {
        this.locateCurrentIndex(true);
      } else {
        this.locateCurrentIndex();
      }
    }
  }

  isButtonEnabled(button: number) {
    return button < this.MOUSE_BTNS.length &&
           this._dragBtns & this.MOUSE_BTNS[button];
  }

  /*
   * Nav button
   */
  moveLeft() {
    const ele = this.el.nativeElement;
    if (this.currIndex !== 0 || this.snapDisabled) {
      this.currIndex--;
      clearTimeout(this.scrollToTimer);
      this.scrollTo(ele, this.toChildrenLocation(), 500);
    }
  }

  moveRight() {
    const ele = this.el.nativeElement;
    if (!this.scrollReachesRightEnd && this.childrenArr[this.currIndex + 1]) {
      this.currIndex++;
      clearTimeout(this.scrollToTimer);
      this.scrollTo(ele, this.toChildrenLocation(), 500);
    }
  }

  moveTo(index: number) {
    const ele = this.el.nativeElement;
    if (index >= 0 && index !== this.currIndex && this.childrenArr[index]) {
      this.currIndex = index;
      clearTimeout(this.scrollToTimer);
      this.scrollTo(ele, this.toChildrenLocation(), 500);
    }
  }

  checkNavStatus() {
    const ele = this.el.nativeElement;
    let childrenWidth = 0;
    for (let i = 0; i < ele.children.length; i++) {
      childrenWidth += ele.children[i].clientWidth;
    }
    if (this.childrenArr.length <= 1 || ele.scrollWidth <= ele.clientWidth) {
      // only one element
      this.reachesLeftBound.emit(true);
      this.reachesRightBound.emit(true);
    } else if (this.scrollReachesRightEnd) {
      // reached right end
      this.reachesLeftBound.emit(false);
      this.reachesRightBound.emit(true);
    } else if (ele.scrollLeft === 0 &&
               ele.scrollWidth > ele.clientWidth) {
      // reached left end
      this.reachesLeftBound.emit(true);
      this.reachesRightBound.emit(false);
    } else {
      // in the middle
      this.reachesLeftBound.emit(false);
      this.reachesRightBound.emit(false);
    }
  }


}

@NgModule({
  exports: [DragScrollDirective],
  declarations: [DragScrollDirective]
})
export class DragScrollModule { }

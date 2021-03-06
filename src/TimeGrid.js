import PropTypes from 'prop-types';
import React, { Component } from 'react';
import zenscroll from 'zenscroll';
import cn from 'classnames';
import { findDOMNode } from 'react-dom';

import dates from './utils/dates';
import localizer from './localizer'
import DayColumn from './DayColumn';
import TimeColumn from './TimeColumn';
import DateContentRow from './DateContentRow';
import Header from './Header';

import getWidth from 'dom-helpers/query/width';
import scrollbarSize from 'dom-helpers/util/scrollbarSize';
import message from './utils/messages';

import { accessor, dateFormat } from './utils/propTypes';

import { notify } from './utils/helpers';

import { accessor as get } from './utils/accessors';

import { inRange, sortEvents, segStyle } from './utils/eventLevels';

export default class TimeGrid extends Component {

  static propTypes = {
    events: PropTypes.array.isRequired,

    step: PropTypes.number,
    range: PropTypes.arrayOf(
      PropTypes.instanceOf(Date)
    ),
    min: PropTypes.instanceOf(Date),
    max: PropTypes.instanceOf(Date),
    now: PropTypes.instanceOf(Date),

    scrollToTime: PropTypes.instanceOf(Date),
    eventPropGetter: PropTypes.func,
    dayFormat: dateFormat,
    culture: PropTypes.string,

    rtl: PropTypes.bool,
    width: PropTypes.number,

    titleAccessor: accessor.isRequired,
    allDayAccessor: accessor.isRequired,
    startAccessor: accessor.isRequired,
    endAccessor: accessor.isRequired,

    selected: PropTypes.object,
    selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),

    onNavigate: PropTypes.func,
    onSelectSlot: PropTypes.func,
    onSelectEnd: PropTypes.func,
    onSelectStart: PropTypes.func,
    onSelectEvent: PropTypes.func,
    onDrillDown: PropTypes.func,
    getDrilldownView: PropTypes.func.isRequired,

    messages: PropTypes.object,
    components: PropTypes.object.isRequired,
  }

  static defaultProps = {
    step: 30,
    min: dates.startOf(new Date(), 'day'),
    max: dates.endOf(new Date(), 'day'),
    scrollToTime: dates.startOf(new Date(), 'day'),
    /* these 2 are needed to satisfy requirements from TimeColumn required props
     * There is a strange bug in React, using ...TimeColumn.defaultProps causes weird crashes
     */
    type: 'gutter',
    now: new Date()
  }

  constructor(props) {
    super(props)
    this.state = { gutterWidth: undefined, isOverflowing: null, timeIndicatorFocused: false };
    this.handleSelectEvent = this.handleSelectEvent.bind(this)
    this.handleHeaderClick = this.handleHeaderClick.bind(this)
  }

  componentWillMount() {
    this._gutters = [];
    this.calculateScroll();
  }

  componentDidMount() {
    this.checkOverflow();
    this.checkAlldayOverflow();

    if (this.props.width == null) {
      this.measureGutter()
    }
    this.applyScroll();

    this.positionTimeIndicator();
    this.triggerTimeIndicatorUpdate();
  }

  componentWillUnmount() {
    window.clearTimeout(this._timeIndicatorTimeout);
  }

  componentDidUpdate() {
    if (this.props.width == null && !this.state.gutterWidth) {
      this.measureGutter()
    }

    this.applyScroll();
    this.positionTimeIndicator();
    //this.checkOverflow()
    this.checkAlldayOverflow();
  }

  componentWillReceiveProps(nextProps) {
    const { range, scrollToTime } = this.props;
    // When paginating, reset scroll
    if (
      !dates.eq(nextProps.range[0], range[0], 'minute') ||
      !dates.eq(nextProps.scrollToTime, scrollToTime, 'minute')
    ) {
      this.calculateScroll();
    }
  }

  handleSelectAllDaySlot = (slots, slotInfo) => {
    const { onSelectSlot } = this.props;
    notify(onSelectSlot, {
      slots,
      start: slots[0],
      end: slots[slots.length - 1],
      action: slotInfo.action
    })
  }

  render() {
    let {
        events
      , range
      , width
      , startAccessor
      , endAccessor
      , allDayAccessor } = this.props;

    width = width || this.state.gutterWidth;

    let start = range[0]
      , end = range[range.length - 1]

    this.slots = range.length;

    let allDayEvents = []
      , rangeEvents = [];

    events.forEach(event => {
      if (inRange(event, start, end, this.props)) {
        let eStart = get(event, startAccessor)
          , eEnd = get(event, endAccessor);

        if (get(event, allDayAccessor) || dates.diff(eStart, eEnd, 'minutes') > dates.MINUTES_IN_DAY) {
          allDayEvents.push(event)
        }
        else
          rangeEvents.push(event)
      }
    })

    allDayEvents.sort((a, b) => sortEvents(a, b, this.props))

    let gutterRef = ref => this._gutters[1] = ref && findDOMNode(ref);

    return (
      <div className='rbc-time-view'>

        {this.renderHeader(range, allDayEvents, width)}

        <div ref='content' className='rbc-time-content'>
          <div ref='timeIndicator' className='rbc-current-time-indicator'>
            <div ref='timeIndicatorDot' className='rbc-current-time-indicator-dot' />
          </div>

          <TimeColumn
            {...this.props}
            showLabels
            style={{ width }}
            ref={gutterRef}
            className='rbc-time-gutter'
          />

          {this.renderEvents(range, rangeEvents, this.props.now)}

        </div>
      </div>
    );
  }

  renderEvents(range, events, today){
    let { min, max, endAccessor, startAccessor, components } = this.props;

    return range.map((date, idx) => {
      let daysEvents = events.filter(
        event => dates.inRange(date,
          get(event, startAccessor),
          get(event, endAccessor), 'day')
      )

      return (
        <DayColumn
          {...this.props }
          min={dates.merge(date, min)}
          max={dates.merge(date, max)}
          eventComponent={components.event}
          eventWrapperComponent={components.eventWrapper}
          dayWrapperComponent={components.dayWrapper}
          className={cn({ 'rbc-now': dates.eq(date, today, 'day') })}
          style={segStyle(1, this.slots)}
          key={idx}
          date={date}
          events={daysEvents}
        />
      )
    })
  }

  renderHeader(range, events, width) {
    let { messages, rtl, selectable, components, now, timezone } = this.props;
    let { isOverflowing, isAlldayOverflowing } = this.state || {};

    let style = {};
    let allDayStyle = {};
    let offsetWidth = 0;

    if (isOverflowing || !isAlldayOverflowing) {
      offsetWidth = scrollbarSize();
    }

    if (isOverflowing) {
      style[rtl ? 'paddingLeft' : 'paddingRight'] = offsetWidth + 'px';
    }

    if (!isAlldayOverflowing) {
      allDayStyle[rtl ? 'marginLeft' : 'marginRight'] = offsetWidth + 'px';
    }

    return (
      <div
        ref='headerCell'
        className={cn(
          'rbc-time-header',
          isOverflowing && 'rbc-overflowing'
        )}
      >
        <div
          className='rbc-row'
          style={style}
        >
          <div
            className='rbc-label rbc-header-gutter'
            style={{ width }}
          />
          { this.renderHeaderCells(range) }
        </div>
        <div
          className='rbc-row'
          style={allDayStyle}
        >
          <div
            ref={ref => this._gutters[0] = ref}
            className='rbc-label rbc-header-gutter'
            style={{ width }}
          >
            { message(messages).allDay }
          </div>
          <DateContentRow
            allDayAccessor={this.props.allDayAccessor}
            ref='alldaycell'
            className='rbc-allday-cell'
            dateCellWrapper={components.dateCellWrapper}
            endAccessor={this.props.endAccessor}
            eventComponent={this.props.components.event}
            eventPropGetter={this.props.eventPropGetter}
            eventWrapperComponent={this.props.components.eventWrapper}
            events={events}
            minRows={2}
            now={now}
            onSelect={this.handleSelectEvent}
            onSelectSlot={this.handleSelectAllDaySlot}
            range={range}
            rtl={this.props.rtl}
            selectable={selectable}
            selected={this.props.selected}
            startAccessor={this.props.startAccessor}
            titleAccessor={this.props.titleAccessor}
            timezone={timezone}
          />
        </div>
      </div>
    )
  }

  renderHeaderCells(range){
    let { dayFormat, culture, components, getDrilldownView, timezone } = this.props;
    let HeaderComponent = components.header || Header

    return range.map((date, i) => {
      let drilldownView = getDrilldownView(date);
      let label = localizer.format(date, dayFormat, culture);

      let header = (
        <HeaderComponent
          date={date}
          label={label}
          localizer={localizer}
          format={dayFormat}
          culture={culture}
        />
      )

      return (
        <div
          key={i}
          className={cn(
            'rbc-header',
            dates.isToday(date, timezone) && 'rbc-today',
          )}
          style={segStyle(1, this.slots)}
        >
          {drilldownView ? (
            <a
              href='#'
              onClick={e => this.handleHeaderClick(date, drilldownView, e)}
            >
              {header}
            </a>
          ) : (
            <span>
              {header}
            </span>
          )}
        </div>
      )
    })
  }

  handleHeaderClick(date, view, e){
    e.preventDefault()
    notify(this.props.onDrillDown, [date, view])
  }

  handleSelectEvent(...args) {
    notify(this.props.onSelectEvent, args)
  }

  handleSelectAlldayEvent(...args) {
    //cancel any pending selections so only the event click goes through.
    this.clearSelection()
    notify(this.props.onSelectEvent, args)
  }

  clearSelection(){
    clearTimeout(this._selectTimer)
    this._pendingSelection = [];
  }

  measureGutter() {
    let width = this.state.gutterWidth;
    let gutterCells = this._gutters;

    if (!width) {
      width = Math.max(...gutterCells.map(getWidth));

      if (width) {
        this.setState({ gutterWidth: width })
      }
    }
  }

  applyScroll() {
    if (this._scrollRatio) {
      const { content } = this.refs;
      content.scrollTop = content.scrollHeight * this._scrollRatio;
      // Only do this once
      this._scrollRatio = null;
    }
  }

  calculateScroll() {
    const { min, max, scrollToTime } = this.props;

    const diffMillis = scrollToTime - dates.startOf(scrollToTime, 'day');
    const totalMillis = dates.diff(max, min);

    this._scrollRatio = diffMillis / totalMillis;
  }

  checkOverflow() {
    if (this._updatingOverflow) return;

    let isOverflowing = this.refs.content.scrollHeight > this.refs.content.clientHeight;

    if (this.state.isOverflowing !== isOverflowing) {
      this._updatingOverflow = true;
      this.setState({ isOverflowing }, () => {
        this._updatingOverflow = false;
      })
    }
  }

  checkAlldayOverflow() {
    if (this._updatingAlldayOverflow) return;

    if (!this.refs.alldaycell || !this.refs.alldaycell.refs.container) return;

    let isAlldayOverflowing = this.refs.alldaycell.refs.container.scrollHeight > this.refs.alldaycell.refs.container.clientHeight;

    if (this.state.isAlldayOverflowing !== isAlldayOverflowing) {
      this._updatingAlldayOverflow = true;
      this.setState({ isAlldayOverflowing }, () => {
        this._updatingAlldayOverflow = false;
      })
    }
  }

  positionTimeIndicator() {
    const { rtl, min, max, timezone } = this.props

    const now = dates.now(timezone);

    const secondsGrid = dates.diff(max, min, 'seconds');
    let secondsPassed = dates.diff(now, min, 'seconds');

    const timeIndicator = this.refs.timeIndicator;
    const timeIndicatorDot = this.refs.timeIndicatorDot;

    if (secondsPassed > dates.SECONDS_IN_DAY) {
      secondsPassed = secondsPassed - dates.SECONDS_IN_DAY;
    }

    const factor = secondsPassed / secondsGrid;
    const timeGutter = this._gutters[this._gutters.length - 1];

    // if (timeGutter && now >= min && now <= max) {
    if (timeGutter) {
      const pixelHeight = timeGutter.offsetHeight;
      const offset = Math.floor(factor * pixelHeight);

      timeIndicator.style.display = 'block';
      timeIndicator.style[rtl ? 'left' : 'right'] = 0;
      timeIndicator.style[rtl ? 'right' : 'left'] = timeGutter.offsetWidth + 'px';
      timeIndicator.style.top = offset + 'px';

      this.focusTimeIndicator();

      // timeIndicatorDot.style[rtl ? 'right' : 'left'] = offset - timeGutter.offsetWidth + 'px';
      timeIndicatorDot.style[rtl ? 'right' : 'left'] = '-6px';
    }
  }

  triggerTimeIndicatorUpdate() {
    // Update the position of the time indicator every minute
    this._timeIndicatorTimeout = window.setTimeout(() => {
      this.positionTimeIndicator();

      this.triggerTimeIndicatorUpdate();
    }, 60000)
  }

  focusTimeIndicator() {
    if (this.state.timeIndicatorFocused) return;

    if (!this.refs.content || !this.refs.timeIndicator) return;

    const scroller = zenscroll.createScroller(this.refs.content);
    scroller.center(this.refs.timeIndicator, 0);

    this.setState({ timeIndicatorFocused: true });
  }
}

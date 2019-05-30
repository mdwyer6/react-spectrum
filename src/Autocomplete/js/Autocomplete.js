import autobind from 'autobind-decorator';
import {chain, interpretKeyboardEvent} from '../../utils/events';
import classNames from 'classnames';
import createId from '../../utils/createId';
import {Menu, MenuItem} from '../../Menu';
import Overlay from '../../OverlayTrigger/js/Overlay';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import scrollToDOMNode from '../../utils/scrollToDOMNode';
import '../style/index.styl';

const getLabel = o => (typeof o === 'string' ? o : o.label);

const LISTBOX = '-listbox';
const OPTION = '-option-';

@autobind
export default class Autocomplete extends React.Component {
  static propTypes = {
    /**
     * Allows input that isn't part of the list of options
     */
    allowCreate: PropTypes.bool,

    /**
     * Value of the input, this puts the autocomplete in a controlled mode.
     */
    value: PropTypes.string,

    /**
     * Callback for when value changes due to selection
     */
    onSelect: PropTypes.func,

    /**
     * String for extra class names to add to the top level div
     */
    className: PropTypes.string,

    /**
     * String that will override the default id generated by the instance
     */
    id: PropTypes.string,

    /**
     * Callback for when the menu opens
     */
    onMenuShow: PropTypes.func,

    /**
     * Callback for when the menu closes
     */
    onMenuHide: PropTypes.func,

    /**
     * A callback for both show and hide, event is false if hiding, true if showing.
     * Reason for this was to add a controlled state in a backwards compatible way,
     * we couldn't use show/hide props for that, so we needed a new one.
     */
    onMenuToggle: PropTypes.func,

    /**
     * Controlled state for showing/hiding menu.
     */
    showMenu: PropTypes.bool,

    /**
     * A function that returns a wrapper component to render a list item label.
     * Useful in providing custom html to the rendered label.
     */
    renderItem: PropTypes.func,

    /**
     * A function that returns the items to be displayed in the menu.
     * Called when the user types in the textfield.
     */
    getCompletions: PropTypes.func.isRequired
  };

  static defaultProps = {
    allowCreate: false
  };

  state = {
    value: '',
    showMenu: false,
    results: [],
    selectedIndex: -1,
    isFocused: false
  };

  constructor(props) {
    super(props);
    this.autocompleteId = createId();
  }

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps(props) {
    if (props.value != null && props.value !== this.state.value) {
      this.setValue(props.value, this._selectedValue !== props.value);
      this._selectedValue = null;
    }

    if (props.showMenu != null && props.showMenu !== this.state.showMenu) {
      this.setState({showMenu: props.showMenu});
    }
  }

  componentDidMount() {
    this.updateSize();
  }

  componentDidUpdate() {
    this.updateSize();
  }

  updateSize() {
    if (this.wrapper) {
      let width = this.wrapper.offsetWidth;
      if (width !== this.state.width) {
        this.setState({width});
      }
    }
  }

  onChange(value) {
    let {onChange} = this.props;
    if (onChange) {
      onChange(value);
    }

    if (!this.state.showMenu) {
      this.showMenu();
    }
    if (this.props.value == null) {
      this.setValue(value);
    }
  }

  setValue(value, showMenu = true) {
    this.setState({
      value,
      showMenu: this.props.showMenu == null ? this.state.isFocused && showMenu : this.props.showMenu,
      selectedIndex: this.props.allowCreate && this.state.selectedIndex === -1 ? -1 : 0
    });

    this.getCompletions(value);
  }

  async getCompletions(value) {
    this.optionIdPrefix = this.optionIdPrefix || this.autocompleteId + LISTBOX;
    this._value = value;

    let results = [];
    let {getCompletions} = this.props;
    if (getCompletions) {
      results = await getCompletions(value);
    }

    // Avoid race condition where two getCompletions calls are made in parallel.
    if (this._value === value) {
      this.setState({results}, () => {
        const list = ReactDOM.findDOMNode(this.getListRef());
        if (list) {
          list.scrollTop = 0;
        }
      });

      return results;
    }

    return this.state.results;
  }

  onSelect(value, event) {
    this._selectedValue = value;
    this.onChange(getLabel(value));
    this.hideMenu();

    if (this.props.onSelect) {
      this.props.onSelect(value, event);
    }
  }

  onFocus() {
    this.setState({isFocused: true});
  }

  onBlur(event) {
    if (this.wrapper && this.wrapper.contains(event.relatedTarget)) {
      // If the element receiving focus is a child of the Autocomplete,
      // for example the toggle button on a ComboBox,
      // do nothing in order prevent hideMenu from executing twice.
      return;
    }
    this.hideMenu();
    this.setState({isFocused: false});
  }

  onEscape(event) {
    event.preventDefault();
    this.hideMenu();
  }

  onSelectFocused(event) {
    // Autocomplete should accept space key as text entry
    if (event.key === ' ') {
      return;
    }
    const {results = [], selectedIndex} = this.state;
    let value = results[selectedIndex];
    if (value) {
      event.preventDefault();
      this.onSelect(value, event);
    } else if (this.props.allowCreate) {
      if (event.key !== 'Tab') {
        event.preventDefault();
      }
      this.onSelect(this.state.value, event);
    }
  }

  onFocusFirst(event) {
    event.preventDefault();
    this.selectIndex(0);
  }

  onFocusLast(event) {
    event.preventDefault();
    this.selectIndex(this.state.results.length - 1);
  }

  onFocusPrevious(event) {
    event.preventDefault();
    const {results = [], selectedIndex} = this.state;
    let index = selectedIndex - 1;
    if (index < 0) {
      index = results.length - 1;
    }

    this.selectIndex(index);
  }

  onFocusNext(event) {
    event.preventDefault();
    // make sure menu is shown
    if (!this.state.showMenu) {
      this.showMenu();
    }
    const {results = [], selectedIndex} = this.state;
    const index = results.length ? (selectedIndex + 1) % results.length : 0;
    this.selectIndex(index);
  }

  onPageDown(event) {
    event.preventDefault();
    const {results = [], selectedIndex, showMenu} = this.state;
    const len = results.length;
    if (!showMenu || !len) {
      return;
    }

    const listNode = ReactDOM.findDOMNode(this.getListRef());
    const items = [...listNode.children];
    const targetItem = items[selectedIndex === -1 ? 0 : selectedIndex];
    const nextPage = Math.min(targetItem.offsetTop + listNode.clientHeight, listNode.scrollHeight + listNode.clientHeight);
    const index = items.indexOf(targetItem) + 1;
    const item = items.slice(index).find(item => item.offsetTop + item.offsetHeight > nextPage);

    if (item) {
      this.selectIndex(items.indexOf(item), true);
    } else {
      this.onFocusLast(event);
    }
  }

  onPageUp(event) {
    event.preventDefault();
    const {results = [], selectedIndex, showMenu} = this.state;
    const len = results.length;
    if (!showMenu || !len) {
      return;
    }

    const listNode = ReactDOM.findDOMNode(this.getListRef());
    const items = [...listNode.children];
    const targetItem = items[selectedIndex === -1 ? 0 : selectedIndex];
    const nextPage = Math.max(targetItem.offsetTop + targetItem.offsetHeight - listNode.clientHeight, 0);
    const index = items.indexOf(targetItem);
    const item = items.slice(0, index).reverse().find(item => item.offsetTop < nextPage);

    if (item) {
      this.selectIndex(items.indexOf(item));
    } else {
      this.onFocusFirst(event);
    }
  }

  onMouseEnter(index) {
    this.selectIndex(index);
  }

  onAltArrowDown(event) {
    event.preventDefault();
    if (!this.state.showMenu) {
      this.showMenu();
    }
  }

  onAltArrowUp(event) {
    event.preventDefault();
    if (this.state.showMenu) {
      this.hideMenu();
    }
  }

  onTab(event) {
    this.onSelectFocused(event);
  }

  selectIndex(selectedIndex, alignToStart) {
    this.setState({selectedIndex}, () => {
      if (this.menu && !isNaN(selectedIndex) && selectedIndex !== -1) {
        // make sure that the selected item scrolls into view
        const list = ReactDOM.findDOMNode(this.getListRef());
        if (list) {
          const node = list.children[selectedIndex];
          if (node) {
            scrollToDOMNode(node, list, alignToStart);
          }
        }
      }
    });
  }

  toggleMenu() {
    if (this.state.showMenu) {
      this.hideMenu();
    } else {
      this.showMenu();
    }
  }

  async showMenu() {
    if (this.props.showMenu == null) {
      this.setState({showMenu: true});
    }

    this.setState({selectedIndex: -1});
    let results = await this.getCompletions(this.state.value) || [];

    // Reset the selected index based on the value
    let selectedIndex = results.findIndex(result => getLabel(result) === this.state.value);
    if (selectedIndex !== -1) {
      this.setState({selectedIndex});
    }

    if (this.props.onMenuShow) {
      this.props.onMenuShow();
    }
    if (this.props.onMenuToggle) {
      this.props.onMenuToggle(true);
    }
  }

  hideMenu() {
    if (this.props.showMenu == null) {
      this.setState({showMenu: false});
    }

    this.setState({selectedIndex: -1});
    if (this.props.onMenuHide) {
      this.props.onMenuHide();
    }

    if (this.props.onMenuToggle) {
      this.props.onMenuToggle(false);
    }
  }

  getActiveDescendantId() {
    const {selectedIndex, showMenu, results = []} = this.state;
    return showMenu && results.length > 0 && selectedIndex !== -1 ? this.optionIdPrefix + OPTION + selectedIndex : undefined;
  }

  getListboxId() {
    const {showMenu, results = []} = this.state;
    return showMenu && results.length > 0 ? this.autocompleteId + LISTBOX : undefined;
  }

  getListRef() {
    return this.menu && this.menu.getListRef();
  }

  render() {
    let {id, className, renderItem} = this.props;
    let {isFocused, results = [], selectedIndex, showMenu, value} = this.state;
    let children = React.Children.toArray(this.props.children);
    let trigger = children.find(c => c.props.autocompleteInput) || children[0];
    let menuShown = showMenu && results.length > 0;
    let inputId = id || trigger.props.id || this.autocompleteId;

    return (
      <div
        className={classNames('react-spectrum-Autocomplete', {'is-focused': isFocused}, className)}
        ref={w => this.wrapper = w}
        role="combobox"
        aria-controls={this.getListboxId()}
        aria-expanded={menuShown}
        aria-haspopup="true"
        aria-owns={this.getListboxId()}>
        {children.map(child => {
          if (child === trigger) {
            return React.cloneElement(child, {
              value: value,
              onChange: chain(child.props.onChange, this.onChange),
              onKeyDown: chain(child.props.onKeyDown, interpretKeyboardEvent.bind(this)),
              onFocus: chain(child.props.onFocus, this.onFocus),
              onBlur: chain(child.props.onBlur, this.onBlur),
              id: inputId,
              autoComplete: 'off',
              role: 'textbox',
              'aria-activedescendant': this.getActiveDescendantId(),
              'aria-autocomplete': 'list',
              'aria-controls': this.getListboxId()
            });
          }

          return child;
        })}

        <Overlay target={this.wrapper} show={menuShown} placement="bottom left" role="presentation">
          <Menu
            onSelect={this.onSelect}
            onMouseDown={e => e.preventDefault()}
            style={{width: this.state.width + 'px'}}
            role="listbox"
            ref={m => this.menu = m}
            id={this.getListboxId()}
            trapFocus={false}>
            {results.map((result, i) => {
              let label = getLabel(result);
              return (
                <MenuItem
                  role="option"
                  id={this.optionIdPrefix + OPTION + i}
                  tabIndex={selectedIndex === i ? 0 : -1}
                  key={`item-${i}`}
                  value={result}
                  icon={result.icon}
                  focused={selectedIndex === i}
                  selected={label === value}
                  onMouseEnter={this.onMouseEnter.bind(this, i)}
                  onMouseDown={e => e.preventDefault()}>
                  {renderItem ? renderItem(result) : label}
                </MenuItem>
              );
            })}
          </Menu>
        </Overlay>
      </div>
    );
  }
}

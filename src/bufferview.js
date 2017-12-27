/*
 * libquassel
 * https://github.com/magne4000/node-libquassel
 *
 * Copyright (c) 2017 Joël Charles
 * Licensed under the MIT license.
 */

/**
 * Quassel BufferView
 */
export default class BufferView {

  /** @type {number} */
  public id;
  /** @type {boolean} */
  public sortAlphabetically;
  /** @type {number} */
  public showSearch;
  /** @type {number} */
  public networkId;
  /** @type {number} */
  public minimumActivity;
  /** @type {boolean} */
  public hideInactiveNetworks;
  /** @type {boolean} */
  public hideInactiveBuffers;
  /** @type {boolean} */
  public disableDecoration;
  /** @type {String} */
  public bufferViewName;
  /** @type {number} */
  public allowedBufferTypes;
  /** @type {boolean} */
  public addNewBuffersAutomatically;
  /** @type {number[]} */
  public TemporarilyRemovedBuffers;
  /** @type {number[]} */
  public RemovedBuffers;
  /** @type {number[]} */
  public BufferList;

  constructor (id, data) {
    this.id = id;

    if (data) {
      this.update(data);
    }
  }

  /**
   * Returns `true` if given `bufferId` is temporarily hidden
   * @param {number} bufferId
   * @returns {boolean}
   */
  isTemporarilyRemoved(bufferId) {
    return this.TemporarilyRemovedBuffers.indexOf(bufferId) !== -1;
  }

  /**
   * Returns `true` if given `bufferId` is permanently hidden
   * @param {number} bufferId
   * @returns {boolean}
   */
  isPermanentlyRemoved(bufferId) {
    return this.RemovedBuffers.indexOf(bufferId) !== -1;
  }

  /**
   * Returns `true` if given `bufferId` is hidden
   * @param {number} bufferId
   * @returns {boolean}
   */
  isHidden(bufferId) {
    return this.isTemporarilyRemoved(bufferId) || this.isPermanentlyRemoved(bufferId);
  }

  /**
   * Remove hidden status for given `bufferId`
   * @param {number} bufferId
   */
  unhide(bufferId) {
    if (typeof bufferId !== 'number') return;
    let index = this.TemporarilyRemovedBuffers.indexOf(bufferId);
    if (index !== -1) {
      this.TemporarilyRemovedBuffers.splice(index, 1);
    } else {
      index = this.RemovedBuffers.indexOf(bufferId);
      if (index !== -1) {
        this.RemovedBuffers.splice(index, 1);
      }
    }
  }

  /**
   * Temporarily hide given `bufferId`
   * @param {number} bufferId
   */
  setTemporarilyRemoved(bufferId) {
    if (typeof bufferId !== 'number') return;
    this.unhide(bufferId);
    this.TemporarilyRemovedBuffers.push(bufferId);
  }

  /**
   * Permanently hide given `bufferId`
   * @param {number} bufferId
   */
  setPermanentlyRemoved(bufferId) {
    if (typeof bufferId !== 'number') return;
    this.unhide(bufferId);
    this.RemovedBuffers.push(bufferId);
  }

  /**
   * Add (or move) a buffer to a specified position
   * @param {number} bufferId
   * @param {number} position
   */
  addBuffer(bufferId, position) {
    const index = this.BufferList.indexOf(bufferId);
    if (index !== -1) {
      this.moveBuffer(bufferId, position);
    } else {
      this.BufferList.splice(position, 0, bufferId);
    }
  }

  /**
   * Move a buffer to another position
   * @param {number} bufferId
   * @param {number} position
   */
  moveBuffer(bufferId, position) {
    const index = this.BufferList.indexOf(bufferId);
    if (index !== -1) {
      this.BufferList.splice(index, 1);
      this.BufferList.splice(position, 0, bufferId);
    }
  }

  /**
   * Used by sort methods
   * @param {number} id1
   * @param {number} id2
   * @returns {number}
   * @example
   * const bufferView = new BufferView(1, {...});
   * anArrayOfBufferIds.sort(bufferView.comparator);
   */
  comparator(id1, id2) {
    if (!this.BufferList) return 0;
    const iid1 = this.BufferList.indexOf(id1);
    const iid2 = this.BufferList.indexOf(id2);
    if (iid1 === iid2) {  // -1 === -1
      return 0;
    }
    return iid1 < iid2 ? -1 : 1;
  }

  update(data) {
    Object.assign(this, data);
  }

  toString() {
    return `<BufferView ${this.bufferViewName}>`;
  }
}

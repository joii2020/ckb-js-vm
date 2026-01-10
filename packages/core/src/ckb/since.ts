type Ordering = -1 | 0 | 1;

type LockValue =
  | { kind: "BlockNumber"; value: bigint }
  | { kind: "EpochNumberWithFraction"; value: EpochNumberWithFraction }
  | { kind: "Timestamp"; value: bigint };

/**
 * Represents a CKB `since` value with helpers for building and comparing locks.
 *
 * @example
 * ```typescript
 * const args = HighLevel.loadScript().args;
 * const since1 = new Since(
 *   HighLevel.loadInputSince(0, bindings.SOURCE_GROUP_INPUT),
 * );
 * const deadline = new Since(numFromBytes(args.slice(64, 72)));
 * const ordering = since1.cmp(deadline);
 * ```
 */
export class Since {
  public raw: bigint;

  static readonly LOCK_TYPE_FLAG = 1n << 63n;
  static readonly METRIC_TYPE_FLAG_MASK = 0x6000_0000_0000_0000n;
  static readonly FLAGS_MASK = 0xff00_0000_0000_0000n;
  static readonly VALUE_MASK = 0x00ff_ffff_ffff_ffffn;
  static readonly REMAIN_FLAGS_BITS = 0x1f00_0000_0000_0000n;
  static readonly LOCK_BY_BLOCK_NUMBER_MASK = 0x0000_0000_0000_0000n;
  static readonly LOCK_BY_EPOCH_MASK = 0x2000_0000_0000_0000n;
  static readonly LOCK_BY_TIMESTAMP_MASK = 0x4000_0000_0000_0000n;

  constructor(v: bigint | undefined) {
    this.raw = v ? v : BigInt(0);
  }

  static fromBlockNumber(n: bigint, absolute: boolean): Since | null {
    if ((n & this.FLAGS_MASK) !== 0n) return null;
    const v =
      n |
      this.LOCK_BY_BLOCK_NUMBER_MASK |
      (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  static fromTimestamp(ts: bigint, absolute: boolean): Since | null {
    if ((ts & this.FLAGS_MASK) !== 0n) return null;
    const v =
      ts | this.LOCK_BY_TIMESTAMP_MASK | (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  static fromEpoch(epoch: EpochNumberWithFraction, absolute: boolean): Since {
    const e = epoch.full;
    const v =
      e | this.LOCK_BY_EPOCH_MASK | (absolute ? 0n : this.LOCK_TYPE_FLAG);
    return new Since(v);
  }

  extractLockValue(): LockValue | undefined {
    const value = this.raw & Since.VALUE_MASK;
    const metric = this.raw & Since.METRIC_TYPE_FLAG_MASK;

    if (metric === Since.LOCK_BY_BLOCK_NUMBER_MASK) {
      return { kind: "BlockNumber", value };
    }
    if (metric === Since.LOCK_BY_EPOCH_MASK) {
      return {
        kind: "EpochNumberWithFraction",
        value: EpochNumberWithFraction.fromFullValue(value),
      };
    }
    if (metric === Since.LOCK_BY_TIMESTAMP_MASK) {
      return { kind: "Timestamp", value: value * 1000n }; // ms
    }
    return undefined;
  }

  isAbsolute(): boolean {
    return (this.raw & Since.LOCK_TYPE_FLAG) === 0n;
  }

  cmp(other: Since): Ordering | null {
    if (this.isAbsolute() != other.isAbsolute()) {
      return null;
    }

    let a = this.extractLockValue();
    let b = other.extractLockValue();
    if (a == undefined || b == undefined) {
      return null;
    }

    if (a.kind != b.kind) {
      return null;
    }

    switch (a.kind) {
      case "BlockNumber":
      case "Timestamp":
        if (a.value < (b as typeof a).value) return -1;
        else if (a.value > (b as typeof a).value) return 1;
        else return 0;
      case "EpochNumberWithFraction":
        return a.value.cmp((b as typeof a).value);
    }
    return null;
  }
  eq(other: Since): boolean {
    return this.cmp(other) === 0;
  }
  lt(other: Since): boolean {
    return this.cmp(other) === -1;
  }
  le(other: Since): boolean {
    let v = this.cmp(other);
    return v === -1 || v === 0;
  }
  gt(other: Since): boolean {
    return this.cmp(other) === 1;
  }
  ge(other: Since): boolean {
    let v = this.cmp(other);
    return v === 1 || v === 0;
  }
}

export class EpochNumberWithFraction {
  constructor(public readonly full: bigint) {}

  static readonly NUMBER_OFFSET = 0n;
  static readonly NUMBER_BITS = 24n;
  static readonly NUMBER_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.NUMBER_BITS;
  static readonly NUMBER_MASK =
    EpochNumberWithFraction.NUMBER_MAXIMUM_VALUE - 1n;
  static readonly INDEX_OFFSET = EpochNumberWithFraction.NUMBER_BITS;
  static readonly INDEX_BITS = 16n;
  static readonly INDEX_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.INDEX_BITS;
  static readonly INDEX_MASK = EpochNumberWithFraction.INDEX_MAXIMUM_VALUE - 1n;
  static readonly LENGTH_OFFSET =
    EpochNumberWithFraction.NUMBER_BITS + EpochNumberWithFraction.INDEX_BITS;
  static readonly LENGTH_BITS = 16n;
  static readonly LENGTH_MAXIMUM_VALUE =
    1n << EpochNumberWithFraction.LENGTH_BITS;
  static readonly LENGTH_MASK =
    EpochNumberWithFraction.LENGTH_MAXIMUM_VALUE - 1n;

  static fromFullValue(value: bigint): EpochNumberWithFraction {
    const e = new EpochNumberWithFraction(value);
    if (e.length() === 0n) {
      const fixed =
        (1n << EpochNumberWithFraction.LENGTH_OFFSET) |
        (e.number() << EpochNumberWithFraction.NUMBER_OFFSET);
      return new EpochNumberWithFraction(fixed);
    }
    return e;
  }

  static new_unchecked(
    number: bigint,
    index: bigint,
    length: bigint,
  ): EpochNumberWithFraction {
    return new EpochNumberWithFraction(
      (length << EpochNumberWithFraction.LENGTH_OFFSET) |
        (index << EpochNumberWithFraction.INDEX_OFFSET) |
        (number << EpochNumberWithFraction.NUMBER_OFFSET),
    );
  }

  static create(
    number: bigint,
    index: bigint,
    length: bigint,
  ): EpochNumberWithFraction | null {
    if (
      number < EpochNumberWithFraction.NUMBER_MAXIMUM_VALUE &&
      index < EpochNumberWithFraction.INDEX_MAXIMUM_VALUE &&
      length < EpochNumberWithFraction.LENGTH_MAXIMUM_VALUE &&
      length > 0 &&
      index < length
    ) {
      return EpochNumberWithFraction.new_unchecked(number, index, length);
    } else {
      return null;
    }
  }

  number(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.NUMBER_OFFSET) &
      EpochNumberWithFraction.NUMBER_MASK
    );
  }
  index(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.INDEX_OFFSET) &
      EpochNumberWithFraction.INDEX_MASK
    );
  }
  length(): bigint {
    return (
      (this.full >> EpochNumberWithFraction.LENGTH_OFFSET) &
      EpochNumberWithFraction.LENGTH_MASK
    );
  }

  cmp(other: EpochNumberWithFraction): Ordering | null {
    const aNum = this.number();
    const bNum = other.number();
    if (aNum < bNum) return -1;
    else if (aNum > bNum) return 1;

    let aBlock = this.index() * other.length();
    let bBlock = other.index() * this.length();

    if (aBlock < bBlock) return -1;
    else if (aBlock > bBlock) return 1;
    else return 0;
  }

  eq(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === 0;
  }
  lt(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === -1;
  }
  le(other: EpochNumberWithFraction): boolean {
    let v = this.cmp(other);
    return v === -1 || v === 0;
  }
  gt(other: EpochNumberWithFraction): boolean {
    return this.cmp(other) === 1;
  }
  ge(other: EpochNumberWithFraction): boolean {
    let v = this.cmp(other);
    return v === 1 || v === 0;
  }

  add(rhs: EpochNumberWithFraction): EpochNumberWithFraction | null {
    const U64_MAX = (1n << 64n) - 1n;
    const toBig = (x: number | bigint) =>
      typeof x === "bigint" ? x : BigInt(x);
    const gcdBig = (a: bigint, b: bigint): bigint => {
      a = a < 0n ? -a : a;
      b = b < 0n ? -b : b;
      while (b !== 0n) {
        const t = a % b;
        a = b;
        b = t;
      }
      return a;
    };

    const aNum = toBig(this.number());
    const bNum = toBig(rhs.number());
    const aIdx = toBig(this.index());
    const bIdx = toBig(rhs.index());
    const aLen = toBig(this.length());
    const bLen = toBig(rhs.length());

    let number = aNum + bNum;
    if (number < 0n || number > U64_MAX) return null;

    let numerator = aIdx * bLen + bIdx * aLen;
    let denominator = aLen * bLen;
    if (denominator === 0n) return null;

    const d = gcdBig(numerator, denominator);
    numerator /= d;
    denominator /= d;
    const fullEpochs = numerator / denominator;
    number += fullEpochs;
    if (number < 0n || number > U64_MAX) return null;

    numerator %= denominator;

    if (numerator < 0n || numerator > U64_MAX) return null;
    if (denominator < 1n || denominator > U64_MAX) return null;

    const out = EpochNumberWithFraction.create(number, numerator, denominator);
    if (!out) return null;
    return out;
  }
}


describe("unittest Since", () => {
  function assert(v: boolean) {
    expect(v).toBe(true);
  }
  function assert_eq<T extends { eq(other: any): boolean }>(
    a: T | null,
    b: T | bigint,
  ) {
    expect(a?.eq(b instanceof Object ? b : new (a!.constructor as any)(b))).toBe(
      true,
    );
  }
  function assert_null<T>(a: T | null) {
    expect(a).toBe(null);
  }

  test("default", () => {
    assert_eq(Since.fromBlockNumber(0x12300n, true), 0x12300n);
    assert_eq(Since.fromBlockNumber(0x12300n, false), 0x8000_0000_0001_2300n);
    assert_null(Since.fromBlockNumber(0x1100_0000_0000_2300n, true));

    assert_eq(Since.fromTimestamp(0xffaa_1122n, true), 0x4000_0000_ffaa_1122n);
    assert_eq(Since.fromTimestamp(0xffaa_1122n, false), 0xc000_0000_ffaa_1122n);
    assert_null(Since.fromTimestamp(0x0100_0000_ffaa_1122n, false));

    assert_eq(
      Since.fromEpoch(EpochNumberWithFraction.fromFullValue(1n), true),
      0x2000_0100_0000_0001n,
    );
    assert_eq(
      Since.fromEpoch(EpochNumberWithFraction.fromFullValue(1n), false),
      0xa000_0100_0000_0001n,
    );
    assert_null(EpochNumberWithFraction.create(16777216n, 1n, 1000n));
    assert_null(EpochNumberWithFraction.create(10000n, 0n, 0n));
    assert_null(EpochNumberWithFraction.create(10000n, 0n, 65536n));
    assert_null(EpochNumberWithFraction.create(10000n, 65536n, 65536n));
    assert_null(EpochNumberWithFraction.create(10000n, 1000n, 1000n));
    assert_null(EpochNumberWithFraction.create(10000n, 1001n, 1000n));

    assert_eq(
      EpochNumberWithFraction.create(16777215n, 65534n, 65535n),
      0xff_ffff_feff_ffffn,
    );

    // add
    assert_eq(
      EpochNumberWithFraction.create(1000n, 1n, 7n)?.add(
        EpochNumberWithFraction.create(2000n, 1n, 5n)!,
      )!,
      EpochNumberWithFraction.create(3000n, 12n, 35n)!,
    );
    assert_eq(
      EpochNumberWithFraction.create(100n, 7n, 13n)?.add(
        EpochNumberWithFraction.create(50n, 3n, 5n)!,
      )!,
      EpochNumberWithFraction.create(151n, 9n, 65n)!,
    );
    assert_eq(
      EpochNumberWithFraction.create(30n, 3n, 8n)?.add(
        EpochNumberWithFraction.create(500n, 5n, 6n)!,
      )!,
      EpochNumberWithFraction.create(531n, 5n, 24n)!,
    );
    assert_null(
      EpochNumberWithFraction.create(1000n, 1n, 1001n)?.add(
        EpochNumberWithFraction.create(2000n, 7n, 1003n)!,
      ),
    );

    assert(
      Since.fromBlockNumber(1234n, true)!.lt(
        Since.fromBlockNumber(2000n, true)!,
      ),
    );
    assert(
      Since.fromBlockNumber(2001n, false)!.gt(
        Since.fromBlockNumber(2000n, false)!,
      ),
    );
    assert(
      Since.fromTimestamp(3111n, true)!.gt(Since.fromTimestamp(2000n, true)!),
    );
    assert(
      Since.fromTimestamp(1999n, false)!.lt(Since.fromTimestamp(2000n, false)!),
    );

    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 999n, 1000n)!,
        true,
      )!.lt(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ),
    );
    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 600n, 1000n)!,
        true,
      )!.lt(
        Since.fromEpoch(EpochNumberWithFraction.create(100n, 8n, 10n)!, true)!,
      ),
    );

    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromBlockNumber(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromEpoch(
        EpochNumberWithFraction.create(100n, 999n, 1000n)!,
        false,
      )!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
    assert(
      Since.fromTimestamp(1234n, true)!.cmp(
        Since.fromTimestamp(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromTimestamp(2000n, false)!,
      ) === null,
    );
    assert(
      Since.fromBlockNumber(1234n, true)!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
    assert(
      Since.fromTimestamp(1234n, true)!.cmp(
        Since.fromEpoch(
          EpochNumberWithFraction.create(101n, 1n, 1000n)!,
          true,
        )!,
      ) === null,
    );
  });
});

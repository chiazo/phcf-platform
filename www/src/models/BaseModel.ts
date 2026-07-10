export default class BaseModel<T extends Record<string, any> = any> {
  protected data: T;

  constructor(data: T = {} as T) {
    this.data = data;

    this._assign(data);
    this._normalizeDates();
    this._normalize();
  }

  protected _assign(data: T) {
    Object.assign(this, data);
  }

  protected _normalize() {}

  protected _normalizeDates() {
    for (const key of Object.keys(this)) {
      const value = (this as Record<string, any>)[key];

      if (typeof value !== "string") continue;

      if (BaseModel._looksLikeDate(value)) {
        const parsed = new Date(value);

        if (!isNaN(parsed.getTime())) {
          (this as Record<string, any>)[key] = parsed;
        }
      }
    }
  }

  static _looksLikeDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
  }

  static from<T, C extends new (data: T) => any>(
    this: C,
    data: T,
  ): InstanceType<C> {
    return new this(data);
  }
}

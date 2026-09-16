/** Pixel layout shared by the offline sign printer and the runtime UV crop. */
export interface BusinessSignAtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly labelsPerPage: number;
  readonly labelHeight: number;
  readonly rowStride: number;
  readonly topInset: number;
}

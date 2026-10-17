import { AppError } from "../errors.js";

export function selectedCoordinatesFrom(source = {}) {
  const hasLatitude = source.latitude !== undefined;
  const hasLongitude = source.longitude !== undefined;

  if (!hasLatitude && !hasLongitude) return undefined;

  const hasNumericShape = (value) =>
    (typeof value === "number" || typeof value === "string") &&
    !(typeof value === "string" && !value.trim());
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  if (
    !hasLatitude ||
    !hasLongitude ||
    !hasNumericShape(source.latitude) ||
    !hasNumericShape(source.longitude) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError(
      "INVALID_DESTINATION_SELECTION",
      "The selected destination coordinates are invalid.",
      400,
    );
  }

  return { latitude, longitude };
}

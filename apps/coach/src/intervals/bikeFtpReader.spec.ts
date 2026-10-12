import { describe, expect, it } from "vitest";
import { bikeFtpOf } from "./bikeFtpReader";

describe("bikeFtpOf", () => {
  it("reads the FTP of the settings that apply to Ride", () => {
    const athlete = {
      sportSettings: [
        { types: ["Run", "TrailRun"], ftp: 300 },
        { types: ["Ride", "VirtualRide"], ftp: 245 }
      ]
    };
    expect(bikeFtpOf(athlete)).toBe(245);
  });

  it.each([
    ["no sport settings", {}],
    ["no bike settings", { sportSettings: [{ types: ["Run"], ftp: 300 }] }],
    ["a bike FTP left empty", { sportSettings: [{ types: ["Ride"], ftp: null }] }],
    ["a zero bike FTP", { sportSettings: [{ types: ["Ride"], ftp: 0 }] }]
  ])("is null with %s", (_label, athlete) => {
    expect(bikeFtpOf(athlete)).toBeNull();
  });
});

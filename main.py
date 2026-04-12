import argparse
from pathlib import Path

import fitdecode

import openkoutsi.workout as workout
from openkoutsi.fit import summarizeWorkout
from openkoutsi.zones import Zones


def main(args):
    print("Hello from openkoutsi!")

    with fitdecode.FitReader(args.input_fit) as fr:
        summary = summarizeWorkout(fr)
        print(f"workout lasted: {summary.duration} seconds")
        print(f"total distance: {summary.distance} m")
        print(f"total elevation gain: {summary.elevationGain} m")
        print(f"average speed: {summary.avgSpeed} km/h")
        print(f"average power: {summary.avgPower} W")
        print(f"average heart rate: {summary.avgHeartRate} BPM")
        print(f"average cadence: {summary.avgCadence} RPM")

    myPowerZones = Zones(
        (0, 132),
        (132, 168),
        (168, 218),
        (218, 255),
        (255, 338),
        (338, 579),
        (579, 2000),
    )

    myHrZones = Zones((0, 134), (134, 144), (144, 160), (160, 176), (176, 220))

    (timeHrZones, timePowerZones) = workout.zoneBreakdown(
        summary, myHrZones, myPowerZones
    )

    print("HR zone breakdown:")
    for zone, dur in timeHrZones.items():
        print(f"time spent in {zone}: {dur}s")

    print("Power zone breakdown:")
    for zone, dur in timePowerZones.items():
        print(f"time spent in {zone}: {dur}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="openkoutsi")
    parser.add_argument("input_fit", type=Path, help="Path to the input FIT file")
    args = parser.parse_args()

    if not args.input_fit.is_file():
        parser.error(f"Input FIT file not found: {args.input_fit}")

    main(args)

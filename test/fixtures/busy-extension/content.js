// Busy-wait for 300 ms so the tool has a known amount of extra work to detect.
const end = performance.now() + 300;
while (performance.now() < end) {}

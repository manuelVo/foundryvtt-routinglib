## 1.0.6
### Algorithm changes
- On griddles scenes, when starting a path on a grid cell which has a wall through its dead-center, the pathfinder will now return that no path exists. This prevents it from suggesting a path that would require to move through that wall.


## 1.0.5
### Performance
- The gridless pathfinder is now twice as fast on scenes with many walls


## 1.0.4
### Bugfixes
- Fixed a bug that caused non-optimal paths to be generated for large hex tokens


## 1.0.3
### Bugfixes
- Fixed a bug that prevented pathfinding on hex to work when the hex size support module is not installed

## 1.0.2
### Bugfixes
- routinglib now works properly with the Wall Height module
- Fixed several bugs that caused pathfinding to not work at all on hex grids

## 1.0.1
### Bugfixes
- Fixed a bug that would break routinglib if the wall height isn't enabled

## 1.0.0
Initial release

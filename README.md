# WorldPainter Realistic River Network

A procedural river generation script for **WorldPainter**, designed to create realistic river networks using hydrology-based terrain analysis.

Instead of simply drawing rivers across the terrain, the script analyzes elevation, identifies drainage paths, calculates flow accumulation, and generates connected river systems where smaller tributaries merge into larger rivers.

The generated rivers naturally flow downhill and can drain into large lakes or exit the map boundaries.

## Features

- **Hydrology-Based Generation:** Analyzes terrain elevation and determines natural drainage directions.
- **Connected River Networks:** Generates multiple tributaries that merge into larger rivers.
- **Lake Drainage:** Routes river networks towards sufficiently large lakes.
- **Flow Accumulation:** Calculates upstream catchment areas to determine where rivers should form and how large they should become.
- **Variable River Width:** River channels gradually become wider downstream based on accumulated water flow.
- **Natural Meanders:** Adds procedural bends and variations to avoid straight, artificial-looking rivers.
- **Variable River Depth:** Creates adjustable river depths with natural channel profiles.
- **Natural Riverbanks:** Smooths surrounding terrain and optionally paints sand and gravel along riverbanks.
- **Downhill Flow:** Ensures generated river surfaces do not rise downstream.
- **Edge Outlets:** Optionally allows drainage towards the edges of the map.
- **Regional Processing:** Allows river carving to be restricted to a selected square region while hydrology analysis still considers the entire map.
- **Seed Control:** Generate consistent river networks using a fixed seed.

## Parameters

| Parameter | Default | Description |
|---|---:|---|
| `cellSize` | 6 | Hydrology grid resolution in blocks |
| `maxHeads` | 12 | Maximum number of river sources |
| `minCatchment` | 150000 | Minimum catchment area required for a stream |
| `minLakeArea` | 30000 | Minimum lake area to qualify as a river destination |
| `widthMin` | 3 | Minimum river width |
| `widthMax` | 26 | Maximum river width |
| `depthMin` | 2 | Minimum river depth |
| `depthMax` | 5 | Maximum river depth |
| `bank` | 4 | Minimum riverbank slope width |
| `meander` | 0.7 | River meander strength (0 = straight) |
| `maxCut` | 8 | Maximum terrain cutting depth for downhill routing |
| `edgeOutlet` | true | Allow rivers to drain off map edges |
| `paintBanks` | true | Paint sand and gravel along riverbanks |
| `seed` | 1 | Random generation seed |
| `regionSize` | 0 | River carving region size (0 = entire map) |
| `regionCenterX` | 0 | Processing region center X |
| `regionCenterY` | 0 | Processing region center Y |

## How It Works

The generation process consists of several stages:

1. **Terrain Sampling:** Creates a lower-resolution elevation grid from the WorldPainter terrain.
2. **Lake Detection:** Identifies connected water bodies and selects suitable lakes as drainage destinations.
3. **Hydrological Routing:** Uses a priority-flood approach to calculate drainage directions across the terrain.
4. **Flow Accumulation:** Calculates how much upstream terrain contributes to each cell.
5. **River Network Generation:** Identifies river sources and connected tributaries based on catchment area.
6. **River Carving:** Creates natural river channels with variable widths, depths, meanders, and banks.

## Usage

1. Open your world in WorldPainter.
2. Open the scripting interface.
3. Load or paste `Realistic River Network.js`.
4. Configure the parameters according to your terrain.
5. Run the script and wait for the hydrology analysis and river generation to finish.

**Important:** Always create a backup of your world before running the script.

## Performance

The script uses a lower-resolution hydrology grid to analyze large terrains efficiently.

- `cellSize = 6` is a good starting point for most maps.
- Use `cellSize = 8` or higher for very large maps.
- Smaller cell sizes provide more detailed hydrological analysis but require more memory and processing time.

The script has a maximum grid limit of 6 million cells.

## Compatibility

Designed for WorldPainter's JavaScript scripting environment.

## License

MIT License (if you choose to distribute this project under MIT).

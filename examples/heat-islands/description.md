Cities are hotter than their surroundings, but the heat isn't spread evenly: some blocks stay several degrees warmer at night than others a few streets away. City-wide satellite maps are too coarse to show this.

## Core Idea

Combine satellite land-surface temperature with a dense network of low-cost street sensors, and learn a model that downscales satellite data to the block level.

## Research Questions

- How much does night-time temperature vary between blocks in the same district?
- Can a downscaling model trained in one district transfer to another?
- Which street features (trees, materials, building height) explain the differences?

## Intended Contribution

1. A block-level characterization of night-time urban heat.
2. A downscaling model that works with cheap sensors.

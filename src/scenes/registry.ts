import { Phone } from './Phone';
import { Network } from './Network';
import { Finale } from './Finale';
import { GraphScene } from './Graph';
import { BeanScene, ExtractionScene, EspressoScene } from './Coffee';
import { IllustratedScene } from '../illustration/IllustratedScene';
export const sceneRegistry = {
  phone: Phone,
  network: Network,
  finale: Finale,
  graph: GraphScene,
  bean: BeanScene,
  extraction: ExtractionScene,
  espresso: EspressoScene,
  illustrated: IllustratedScene,
};

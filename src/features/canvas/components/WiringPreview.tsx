import { Line } from 'react-konva';
import { getWiringPreviewPoints } from '../../../utils/wireRouting';
import { WIRING_PREVIEW_COLOR } from '../canvasConstants';

interface WiringPreviewProps {
  fromPos: { x: number; y: number };
  mousePos: { x: number; y: number };
}

/** Dashed line rendered while the user is actively wiring between two pins. */
const WiringPreview = ({ fromPos, mousePos }: WiringPreviewProps) => (
  <Line
    points={getWiringPreviewPoints(fromPos, mousePos)}
    stroke={WIRING_PREVIEW_COLOR}
    strokeWidth={2}
    dash={[8, 4]}
    lineCap="round"
    shadowColor={WIRING_PREVIEW_COLOR}
    shadowBlur={8}
    shadowOpacity={0.6}
    listening={false}
  />
);

export default WiringPreview;

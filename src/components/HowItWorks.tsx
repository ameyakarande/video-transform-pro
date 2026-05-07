import type React from 'react';
import { ArrowLeft, Download, Film, Layers, Palette, Scissors, Upload } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Upload your video',
    text: 'Click the editor canvas or the Source Video upload control, then choose an MP4, MOV, or WebM file from your device.',
    image: '/how-it-works/step-upload.svg',
    icon: Upload,
  },
  {
    number: '02',
    title: 'Pick the output frame',
    text: 'Choose 16:9 for YouTube-style exports or 9:16 for vertical social clips, then use Fill or Fit to control how the video sits in the frame.',
    image: '/how-it-works/step-format.svg',
    icon: Film,
  },
  {
    number: '03',
    title: 'Apply a LUT preset',
    text: 'Open Presets, select a LUT thumbnail, and preview the grade in the player. Single mode replaces the active preset for a smoother workflow.',
    image: '/how-it-works/step-presets.svg',
    icon: Palette,
  },
  {
    number: '04',
    title: 'Trim the exact clip',
    text: 'Use the trim area to set the start and end points. The timeline controls let you review the selected section before export.',
    image: '/how-it-works/step-trim.svg',
    icon: Scissors,
  },
  {
    number: '05',
    title: 'Add finishing layers',
    text: 'Mute original audio, add background music, upload subtitles, or place text, images, and video overlays where they belong.',
    image: '/how-it-works/step-layers.svg',
    icon: Layers,
  },
  {
    number: '06',
    title: 'Export locally',
    text: 'Click Export Video. Cinemaster renders the finished clip in your browser and downloads the MP4 when processing is complete.',
    image: '/how-it-works/step-export.svg',
    icon: Download,
  },
];

interface HowItWorksProps {
  onBack: () => void;
}

const HowItWorks: React.FC<HowItWorksProps> = ({ onBack }) => {
  return (
    <main className="how-page">
      <section className="how-hero">
        <button className="how-back" onClick={onBack}>
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Back to editor
        </button>
        <div>
          <span className="how-kicker">Workflow Guide</span>
          <h1>How Cinemaster works</h1>
          <p>
            A simple browser-based workflow for uploading a video, shaping the frame,
            applying LUTs, adding finishing touches, and exporting the final edit.
          </p>
        </div>
      </section>

      <section className="how-steps">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article className="how-step" key={step.number}>
              <div className="how-step-copy">
                <div className="how-step-topline">
                  <span>{step.number}</span>
                  <Icon style={{ width: 18, height: 18 }} />
                </div>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </div>
              <div className="how-step-media">
                <img src={step.image} alt={`${step.title} walkthrough`} />
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
};

export default HowItWorks;

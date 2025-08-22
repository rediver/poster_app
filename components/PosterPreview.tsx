import React from 'react';

interface PosterConfig {
  title: string;
  subtitle: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'map' | 'modern' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
}

interface PosterPreviewProps {
  config: PosterConfig;
}

export function PosterPreview({ config }: PosterPreviewProps) {
  const getLayoutClasses = () => {
    switch (config.layout) {
      case 'modern':
        return 'justify-between';
      case 'minimal':
        return 'justify-center items-center';
      default:
        return 'justify-start';
    }
  };

  // Calculate poster dimensions based on format and orientation
  const getDimensions = () => {
    const isVertical = config.orientation === 'vertical';
    
    if (config.format === 'A3') {
      return {
        width: isVertical ? 420 : 594,
        height: isVertical ? 594 : 420,
        scale: 0.6 // Scale down for preview
      };
    } else { // A4
      return {
        width: isVertical ? 297 : 420,
        height: isVertical ? 420 : 297,
        scale: 0.8 // Scale down for preview
      };
    }
  };

  const dimensions = getDimensions();
  const previewWidth = dimensions.width * dimensions.scale;
  const previewHeight = dimensions.height * dimensions.scale;

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Adjust font sizes based on format and orientation
  const getFontSizes = () => {
    const baseMultiplier = config.format === 'A3' ? 1.3 : 1;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      alphabet: Math.round(18 * baseMultiplier * orientationMultiplier),
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
      subtitle: Math.round(12 * baseMultiplier * orientationMultiplier)
    };
  };

  const fontSizes = getFontSizes();

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div 
        className="relative border-2 border-gray-300 shadow-lg"
        style={{ 
          backgroundColor: config.backgroundColor,
          width: `${previewWidth}px`,
          height: `${previewHeight}px`
        }}
      >
        <div className={`h-full p-6 flex flex-col ${getLayoutClasses()}`}>
          {config.showAlphabet && (
            <div className="mb-4">
              <pre 
                className="whitespace-pre-wrap"
                style={{ 
                  color: config.textColor,
                  fontFamily: config.fontFamily,
                  fontSize: `${fontSizes.alphabet}px`,
                  lineHeight: '1.1',
                  fontWeight: '600'
                }}
              >
                {alphabetText}
              </pre>
            </div>
          )}
          
          <div className="flex-1 flex flex-col justify-end">
            <h1 
              className="mb-2"
              style={{ 
                color: config.accentColor,
                fontFamily: config.fontFamily,
                fontSize: `${fontSizes.title}px`,
                fontWeight: '700',
                lineHeight: '1.1'
              }}
            >
              {config.title}
            </h1>
            
            {config.subtitle && (
              <p 
                style={{ 
                  color: config.textColor,
                  fontFamily: config.fontFamily,
                  fontSize: `${fontSizes.subtitle}px`,
                  lineHeight: '1.3'
                }}
              >
                {config.subtitle}
              </p>
            )}
          </div>
        </div>
        
        {/* Format and orientation indicator */}
        <div className="absolute -bottom-8 left-0 text-xs text-gray-500">
          {config.format} - {config.orientation}
        </div>
      </div>
    </div>
  );
}
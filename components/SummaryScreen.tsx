import React, { useState } from 'react';
import { logModule, useLogMount } from '../src/debug';
logModule('components/SummaryScreen.tsx module');
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

interface PosterConfig {
  title: string;
  subtitle: string;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout: 'classic' | 'modern' | 'minimal';
  showAlphabet: boolean;
  format: 'A3' | 'A4';
  orientation: 'vertical' | 'horizontal';
}

interface SummaryScreenProps {
  config: PosterConfig;
  onBack: () => void;
}

export function SummaryScreen({ config, onBack }: SummaryScreenProps) {
  useLogMount('SummaryScreen');
  const [isReviewed, setIsReviewed] = useState(false);

  const handleCheckout = () => {
    alert('Checkout functionality would be implemented here');
  };

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

  // Calculate poster dimensions for larger preview
  const getDimensions = () => {
    const isVertical = config.orientation === 'vertical';
    
    if (config.format === 'A3') {
      return {
        width: isVertical ? 420 : 594,
        height: isVertical ? 594 : 420,
        scale: 0.9 // Larger scale for summary
      };
    } else { // A4
      return {
        width: isVertical ? 297 : 420,
        height: isVertical ? 420 : 297,
        scale: 1.2 // Much larger scale for A4 in summary
      };
    }
  };

  const dimensions = getDimensions();
  const previewWidth = dimensions.width * dimensions.scale;
  const previewHeight = dimensions.height * dimensions.scale;

  const alphabetText = "ABCD\nEFGHIJK\nLMNOP\nQRSTUV\nWXYZ";

  // Adjust font sizes for larger preview
  const getFontSizes = () => {
    const baseMultiplier = config.format === 'A3' ? 1.6 : 1.4;
    const orientationMultiplier = config.orientation === 'horizontal' ? 0.85 : 1;
    
    return {
      alphabet: Math.round(18 * baseMultiplier * orientationMultiplier),
      title: Math.round(28 * baseMultiplier * orientationMultiplier),
      subtitle: Math.round(12 * baseMultiplier * orientationMultiplier)
    };
  };

  const fontSizes = getFontSizes();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex min-h-screen">
        {/* Left side - Large Poster Preview */}
        <div className="flex-1 bg-white border-r border-gray-200 flex items-center justify-center p-12">
          <div className="relative">
            <div 
              className="relative border-2 border-gray-300 shadow-2xl"
              style={{ 
                backgroundColor: config.backgroundColor,
                width: `${previewWidth}px`,
                height: `${previewHeight}px`
              }}
            >
              <div className={`h-full p-8 flex flex-col ${getLayoutClasses()}`}>
                {config.showAlphabet && (
                  <div className="mb-6">
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
                    className="mb-3"
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
            </div>
            
            {/* Format and orientation indicator */}
            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-sm text-gray-500 bg-white px-3 py-1 rounded shadow">
              {config.format} - {config.orientation}
            </div>
          </div>
        </div>

        {/* Right side - Summary and Checkout */}
        <div className="w-[480px] bg-white flex flex-col justify-center p-8">
          <div className="max-w-md mx-auto w-full space-y-8">
            <div className="space-y-4">
              <h1>You made it!</h1>
              <p className="text-muted-foreground">
                congratulations on making a poster, it will definitely look beautiful! you have two last choices and it's ready
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="review"
                  checked={isReviewed}
                  onCheckedChange={(checked) => setIsReviewed(checked as boolean)}
                  className="mt-1"
                />
                <label 
                  htmlFor="review" 
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  I have review the file and am happy to print
                </label>
              </div>

              <div className="flex space-x-3">
                <Button 
                  onClick={onBack}
                  variant="outline"
                  className="flex-1 h-12"
                >
                  Back
                </Button>
                
                <Button 
                  onClick={handleCheckout}
                  disabled={!isReviewed}
                  className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
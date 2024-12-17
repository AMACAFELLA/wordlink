import { Devvit } from '@devvit/public-api';

export const LoadingAnimation = (): JSX.Element => (
  <vstack width="100%" height="100%" alignment="middle center" backgroundColor="#8B4513" padding="medium">
    {/* Wooden frame with inner shadow effect */}
    <vstack 
      width="100%" 
      height="100%" 
      backgroundColor="#2a3638"
      cornerRadius="medium"
      border="thick"
      borderColor="#654321"
      padding="large"
      alignment="middle center"
    >
      {/* Main content container */}
      <vstack gap="large" alignment="middle center">
        {/* Title with chalk effect */}
        <text 
          size="xxlarge" 
          color="#ffd700" 
          weight="bold"
          style="heading"
        >
          Loading....
        </text>       
      </vstack>
    </vstack>
  </vstack>
);

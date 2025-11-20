declare module 'react-qr-scanner' {
  import { Component } from 'react';

  interface QrScannerProps {
    onDecode: (result: string) => void;
    onError?: (error: any) => void;
    constraints?: MediaTrackConstraints;
    containerStyle?: React.CSSProperties;
    videoStyle?: React.CSSProperties;
  }

  class QrScanner extends Component<QrScannerProps> {}
  export default QrScanner;
}

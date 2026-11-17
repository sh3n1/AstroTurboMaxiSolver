import { Component } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { openOutline } from 'ionicons/icons';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** The credits the licences of the app's data and libraries require, as a section of Settings. */
@Component({
  selector: 'app-settings-credits',
  imports: [IonIcon, IonItem, IonLabel, IonList, IonListHeader],
  styles: [
    SETTINGS_SECTION_STYLES,
    `
      .credit {
        font-size: calc(14px * var(--af-scale, 1));
      }
    `,
  ],
  template: `
    <ion-list inset="true">
      <ion-list-header>Data credits</ion-list-header>
      <ion-item
        data-testid="credit-openngc"
        href="https://github.com/mattiaverga/OpenNGC"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">
          NGC and IC objects from OpenNGC by Mattia Verga, CC BY-SA 4.0. Converted and filtered for this app.
        </ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit"
          >Stars, star names and constellation lines from XHIP and the IAU, via d3-celestial.</ion-label
        >
      </ion-item>
      <ion-item
        data-testid="credit-hyg"
        href="https://github.com/astronexus/HYG-Database"
        target="_blank"
        rel="noopener"
        detail="false"
      >
        <ion-label class="ion-text-wrap credit">
          Star catalogue names from the HYG Database by David Nash, CC BY-SA 4.0. Converted and filtered for this app.
        </ion-label>
        <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">Messier data by H. Frommert, seds.org, via d3-celestial.</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">Caldwell catalogue compiled by Sir Patrick Moore.</ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          Herschel 400 selected by the Ancient City Astronomy Club, Herschel II by the Rose City Astronomers, as
          observed in the Astronomical League's programmes.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          110 Best NGC Objects by A. J. Crayon and Steve Coe, Saguaro Astronomy Club.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          Finest NGC list by Alan Dyer, Royal Astronomical Society of Canada.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          Deep-Sky Gems by David H. Levy and Explore the Universe, Royal Astronomical Society of Canada.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          Urban Observing Program, Astronomical League. Top-100 Deepsky Objects, Astronomical Society of Southern
          Africa.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit">
          Monthly lists from NASA's Hubble Night Sky Challenge. NASA does not endorse this app.
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit" data-testid="credit-wds"
          >Double stars from the Washington Double Star Catalog, maintained at the U.S. Naval Observatory.</ion-label
        >
      </ion-item>
      <!-- Open-Meteo's data is CC BY 4.0, which asks for this credit. -->
      <ion-item>
        <ion-label class="ion-text-wrap credit" data-testid="credit-open-meteo"
          >Weather forecast by Open-Meteo.com, CC BY 4.0, from NOAA's GFS model. Seeing worked out with the AXP model of
          Trinquet and Vernin.</ion-label
        >
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit"
          >Compass correction from the World Magnetic Model, NOAA and the British Geological Survey, via geomagnetism by
          Natural Atlas, Apache License 2.0.</ion-label
        >
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit"
          >Planets, Pluto, Moon and sky positions by Astronomy Engine, Don Cross.</ion-label
        >
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit"
          >Log and lists saved with Dexie.js, David Fahlander, Apache License 2.0.</ion-label
        >
      </ion-item>
      <ion-item>
        <ion-label class="ion-text-wrap credit"
          >Pairing codes made with QR Code Generator, Kazuhiko Arase, MIT License, and read with jsQR, Cosmo Wolfe,
          Apache License 2.0. QR Code is a trademark of DENSO WAVE.</ion-label
        >
      </ion-item>
      <ion-item lines="none" data-testid="credit-jpl">
        <ion-label class="ion-text-wrap credit"
          >Orbits of Ceres, Vesta, Pallas and Juno from the NASA/JPL Small-Body Database.</ion-label
        >
      </ion-item>
    </ion-list>
  `,
})
export class SettingsCreditsComponent {
  constructor() {
    addIcons({ openOutline });
  }
}
